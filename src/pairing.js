import { base64, fingerprint, unbase64 } from './codec.js';

const encode = new TextEncoder();
export function pairingFault(code) {
	return Object.assign(new Error('Pairing could not be completed'), { code });
}
export function pairingCode(value) {
	if (typeof value !== 'string') throw pairingFault('PAIRING_CODE_INVALID');
	const code = value.trim();
	if (!/^[0-9]{6}$/.test(code)) throw pairingFault('PAIRING_CODE_INVALID');
	return code;
}
async function pairingRequest(api, method, suffix, data) {
	try {
		return await api.request(method, suffix, data);
	} catch (error) {
		if (error?.status === 404)
			throw Object.assign(pairingFault('PAIRING_UNAVAILABLE'), { status: 404 });
		if (error?.status === 409)
			throw Object.assign(
				pairingFault(suffix === 'pairing/claim' ? 'PAIRING_PENDING' : 'PAIRING_CHANGED'),
				{ status: 409 },
			);
		throw error;
	}
}
const publicShape = (key) => ({ kty: key.kty, crv: key.crv, x: key.x, y: key.y });
export async function pairingFingerprint(publicKey) {
	return (await fingerprint(encode.encode(JSON.stringify(publicShape(publicKey)))))
		.slice(0, 12)
		.match(/.{4}/g)
		.join('-');
}
async function transferKey(privateKey, publicKey, id, salt) {
	const peer = await crypto.subtle.importKey(
		'jwk',
		publicShape(publicKey),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[],
	);
	const shared = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256),
	);
	try {
		const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
		const box = await crypto.subtle.deriveKey(
			{ name: 'HKDF', hash: 'SHA-256', salt, info: encode.encode(`smart-sync-2-pair:${id}`) },
			material,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt'],
		);
		const sasBytes = new Uint8Array(shared.length + salt.length + encode.encode(id).length);
		sasBytes.set(shared);
		sasBytes.set(salt, shared.length);
		sasBytes.set(encode.encode(id), shared.length + salt.length);
		const verification = (await fingerprint(sasBytes)).slice(0, 12).match(/.{4}/g).join('-');
		return { box, verification };
	} finally {
		shared.fill(0);
	}
}
export async function beginPairing(api) {
	const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
		'deriveBits',
	]);
	const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey);
	const request = await api.request('POST', 'pairing/start', { publicKey });
	return {
		...request,
		privateKey: keys.privateKey,
		fingerprint: await pairingFingerprint(publicKey),
		origin: api.origin,
	};
}
export async function inspectPairing(api, code) {
	code = pairingCode(code);
	const request = await pairingRequest(api, 'GET', `pairing/${code}`);
	return { ...request, fingerprint: await pairingFingerprint(request.publicKey) };
}
export async function approvePairing(
	api,
	code,
	encryptionPassword,
	expectedFingerprint,
	label = 'Paired device',
	accountEncryptionPassword,
) {
	code = pairingCode(code);
	const request = await inspectPairing(api, code);
	if (request.fingerprint !== expectedFingerprint) throw new Error('Pairing verification changed');
	const grant = await pairingRequest(api, 'POST', `pairing/${code}/grant`, {
		workspace: api.workspace,
		label,
	});
	if ((await pairingFingerprint(grant.publicKey)) !== expectedFingerprint)
		throw new Error('Pairing public key changed');
	const sender = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
		'deriveBits',
	]);
	const salt = crypto.getRandomValues(new Uint8Array(16)),
		nonce = crypto.getRandomValues(new Uint8Array(12));
	const key = await transferKey(sender.privateKey, request.publicKey, request.id, salt);
	const bytes = encode.encode(
		JSON.stringify({
			format: 2,
			origin: api.origin,
			workspace: api.workspace,
			accessKey: grant.key,
			encryptionPassword,
			...(accountEncryptionPassword?{accountEncryptionPassword}:{}),
		}),
	);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce, additionalData: encode.encode(request.id) },
		key.box,
		bytes,
	);
	const sealed = {
		format: 2,
		ephemeral: await crypto.subtle.exportKey('jwk', sender.publicKey),
		salt: base64(salt),
		nonce: base64(nonce),
		ciphertext: base64(new Uint8Array(ciphertext)),
	};
	await pairingRequest(api, 'POST', `pairing/${code}/approve`, { grantId: grant.id, sealed });
	return { grantId: grant.id, verification: key.verification };
}
export async function finishPairing(api, request) {
	const { sealed } = await pairingRequest(api, 'POST', 'pairing/claim', {
		id: request.id,
		claim: request.claim,
	});
	if (sealed?.format !== 2) throw new Error('Invalid pairing response');
	const salt = unbase64(sealed.salt),
		nonce = unbase64(sealed.nonce),
		ciphertext = unbase64(sealed.ciphertext);
	if (salt.length !== 16 || nonce.length !== 12 || ciphertext.length > 16384)
		throw new Error('Invalid encrypted pairing envelope');
	const key = await transferKey(request.privateKey, sealed.ephemeral, request.id, salt);
	const clear = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: nonce, additionalData: encode.encode(request.id) },
		key.box,
		ciphertext,
	);
	const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clear));
	if (
		data?.format !== 2 ||
		data.origin !== api.origin ||
		typeof data.workspace !== 'string' ||
		!/^[a-f0-9-]{36}$/.test(data.workspace) ||
		typeof data.accessKey !== 'string' ||
		data.accessKey.length < 32 ||
		typeof data.encryptionPassword !== 'string' ||
		data.encryptionPassword.length < 12
		|| (data.accountEncryptionPassword!==undefined && (typeof data.accountEncryptionPassword!=='string'||data.accountEncryptionPassword.length<12))
	)
		throw new Error('Invalid pairing configuration');
	return { ...data, verification: key.verification };
}
