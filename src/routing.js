import { responseBytes, withCancellation, fetchWithDeadline, waitForSignal } from './client.js';
import { verifyIdentitySignature } from './compatibility.js';
import { base64, unbase64 } from './codec.js';

export function serviceOrigin(value) {
	const url = new URL(value);
	if (
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== '/' ||
		(url.protocol !== 'https:' &&
			!(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
	)
		throw new Error('Use HTTPS outside loopback; LAN HTTP cannot protect access credentials');
	return url.origin;
}
const message = (nonce, origin) =>
	new TextEncoder().encode(`smart-sync-service-identity:2:${origin}:${nonce}`);
export async function verifyService(origin, pinned, fetcher = fetch, timeout = 1500, parentSignal) {
	return withCancellation([parentSignal], timeout, async signal => {
		const nonce = base64(crypto.getRandomValues(new Uint8Array(24)));
		const response = await waitForSignal(fetcher(
			`${origin}/ss2/identity?nonce=${encodeURIComponent(nonce)}&audience=${encodeURIComponent(origin)}`,
			{
				redirect: 'error',
				signal,
			},
		), signal, reply => reply.body?.cancel());
		if (!response.ok) {
			void response.body?.cancel().catch(() => {});
			throw new Error('Service identity unavailable');
		}
		const proof = JSON.parse(
			new TextDecoder('utf8', { fatal: true }).decode(await responseBytes(response, 4096, undefined, signal)),
		);
		if (
			proof.origin !== origin ||
			typeof proof.key !== 'string' ||
			proof.key.length > 256 ||
			(pinned && proof.key !== pinned)
		)
			throw new Error('Service identity differs from the pinned authority');
		if (!(await verifyIdentitySignature(unbase64(proof.key), unbase64(proof.signature), message(nonce, origin))))
			throw new Error('Service identity proof rejected');
		return proof.key;
	});
}
export async function routedFetch({
	origin,
	lan,
	pinned,
	savePin = async () => {},
	fetcher = fetch,
	signal,
}) {
	origin = serviceOrigin(origin);
	const pin = pinned ?? (await verifyService(origin, undefined, fetcher, 5000, signal));
	if (!pinned) await savePin(pin);
	let preferred;
	if (lan) {
		try {
			preferred = serviceOrigin(lan);
			await verifyService(preferred, pin, fetcher, 1500, signal);
		} catch {
			if (signal?.aborted) throw signal.reason;
			preferred = undefined;
		}
	}
	if (!preferred && pinned) await verifyService(origin, pin, fetcher, 5000, signal);
	const request = async (url, options) => {
		if (!url.startsWith(`${origin}/`)) throw new Error('Request left the configured authority');
		if (preferred) {
			try {
				const reply = await fetchWithDeadline(fetcher, `${preferred}${url.slice(origin.length)}`, {
					...options,
					redirect: 'error',
				}, 3500);
				if (![502, 503, 504].includes(reply.status) || !['GET', 'PUT'].includes(options.method))
					return reply;
				await reply.body?.cancel();
			} catch (error) {
				if (options.signal?.aborted || !['GET', 'PUT'].includes(options.method)) throw error;
			}
			preferred = undefined;
			await verifyService(origin, pin, fetcher, 5000, options.signal);
		}
		return fetcher(url, options);
	};
	return { fetcher: request, key: pin, route: preferred ? 'lan' : 'primary' };
}
