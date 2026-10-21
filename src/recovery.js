import { base64, freshSalt, packNote, unbase64, unlockWorkspace, unpackNote } from './codec.js';
export async function encryptRecovery(configuration, password) {
	const salt = freshSalt(),
		keys = await unlockWorkspace(password, salt);
	const bytes = new TextEncoder().encode(JSON.stringify(configuration));
	if (bytes.length > 65536) throw new Error('Recovery configuration is too large');
	const packet = await packNote(keys, 'smart-sync-2-recovery', 'recovery.json', bytes);
	return JSON.stringify({
		format: 'smart-sync-recovery-2',
		salt,
		id: packet.id,
		manifest: packet.manifest,
		objects: packet.objects.map((object) => ({
			address: object.address,
			body: base64(object.body),
		})),
	});
}
export async function decryptRecovery(encoded, password) {
	if (typeof encoded !== 'string' || encoded.length > 262144)
		throw new Error('Invalid recovery package');
	const data = JSON.parse(encoded);
	if (
		data?.format !== 'smart-sync-recovery-2' ||
		!Array.isArray(data.objects) ||
		data.objects.length > 3
	)
		throw new Error('Invalid recovery package');
	const keys = await unlockWorkspace(password, data.salt);
	const objects = new Map(data.objects.map((object) => [object.address, unbase64(object.body)]));
	const result = await unpackNote(
		keys,
		'smart-sync-2-recovery',
		data.id,
		data.manifest,
		async (address) => {
			const object = objects.get(address);
			if (!object) throw new Error('Recovery object is missing');
			return object;
		},
	);
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.contents));
}
