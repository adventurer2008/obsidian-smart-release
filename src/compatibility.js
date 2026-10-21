import { zlibSync, unzlibSync } from 'fflate';
import { verifyAsync } from '@noble/ed25519';

// Keep existing WebCrypto authentication; never replace unavailable secure primitives with weak ones.
export function requireRuntime() {
	if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.getRandomValues !== 'function' ||
		typeof AbortController !== 'function' || typeof structuredClone !== 'function' ||
		typeof Object.hasOwn !== 'function' || typeof ReadableStream !== 'function')
		throw Object.assign(Error('Host runtime is missing required secure Web APIs'), { code: 'HOST_RUNTIME_UNSUPPORTED' });
}
async function transform(bytes, Stream, maximum) {
	const reader = new Blob([bytes]).stream().pipeThrough(new Stream('deflate')).getReader();
	const parts = []; let length = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > maximum) throw Error('Expanded object exceeds its declared limit');
			parts.push(value);
		}
	} finally { await reader.cancel().catch(() => {}); }
	const result = new Uint8Array(length); let offset = 0;
	for (const part of parts) { result.set(part, offset); offset += part.length; }
	return result;
}
export async function compressBytes(bytes, maximum) {
	if (typeof CompressionStream === 'function' && typeof Blob.prototype.stream === 'function')
		return transform(bytes, CompressionStream, maximum);
	const packed = zlibSync(bytes);
	if (packed.length > maximum) throw Error('Compressed object exceeds its declared limit');
	return packed;
}
export async function decompressBytes(bytes, maximum) {
	if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > 2 * 1024 * 1024) throw Error('Invalid decompression bound');
	if (typeof DecompressionStream === 'function' && typeof Blob.prototype.stream === 'function')
		return transform(bytes, DecompressionStream, maximum);
	// A fixed output buffer bounds allocation even for a small compressed expansion bomb.
	const output = unzlibSync(bytes, { out: new Uint8Array(maximum + 1) });
	if (output.length > maximum) throw Error('Expanded object exceeds its declared limit');
	// fflate does not validate Adler-32; match the native zlib stream's integrity check.
	let a = 1, b = 0;
	for (const value of output) { a = (a + value) % 65521; b = (b + a) % 65521; }
	const checksum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4);
	if ((((b << 16) | a) >>> 0) !== checksum) throw Error('Invalid compressed object checksum');
	return output;
}
export async function verifyIdentitySignature(spki, signature, message) {
	// RFC 8410 Ed25519 SPKI has an exact algorithm identifier and a 32-byte public key.
	const prefix = [48, 42, 48, 5, 6, 3, 43, 101, 112, 3, 33, 0];
	if (!(spki instanceof Uint8Array) || spki.length !== 44 || !prefix.every((byte, i) => spki[i] === byte) ||
		!(signature instanceof Uint8Array) || signature.length !== 64) return false;
	try {
		const key = await crypto.subtle.importKey('spki', spki, 'Ed25519', false, ['verify']);
		return await crypto.subtle.verify('Ed25519', key, signature, message);
	} catch (error) {
		if (error?.name !== 'NotSupportedError') throw error;
		// Only an unavailable algorithm selects the fallback; invalid signatures never downgrade verification.
		return verifyAsync(signature, message, spki.subarray(12), { zip215: false });
	}
}
