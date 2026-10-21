import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freshSalt, unlockWorkspace, packNote, inspectNote, unpackNote } from '../src/codec.js';

test('verified manifest reuse saves a fetch and preserves authenticated fields and all domain bindings', async () => {
	const keys = await unlockWorkspace('synthetic verified manifest password', freshSalt());
	const bytes = new TextEncoder().encode('verified manifest payload');
	const packet = await packNote(keys, 'workspace-a', 'original.md', bytes);
	const objects = new Map(packet.objects.map(object => [object.address, object.body]));
	let manifestLoads = 0;
	const load = async address => { if (address === packet.manifest) manifestLoads++; return objects.get(address); };
	const inspected = await inspectNote(keys, 'workspace-a', packet.id, packet.manifest, load);
	inspected.path = 'changed.md';
	inspected.segments[0].address = 'f'.repeat(64);
	const decoded = await unpackNote(keys, 'workspace-a', packet.id, packet.manifest, load, inspected);
	assert.equal(decoded.path, 'original.md');
	assert.deepEqual(decoded.contents, bytes);
	assert.equal(manifestLoads, 1);
	for (const [otherKeys, workspace, id, address, info] of [
		[keys, 'workspace-b', packet.id, packet.manifest, inspected],
		[keys, 'workspace-a', 'f'.repeat(64), packet.manifest, inspected],
		[keys, 'workspace-a', packet.id, 'e'.repeat(64), inspected],
		[{ ...keys }, 'workspace-a', packet.id, packet.manifest, inspected],
		[keys, 'workspace-a', packet.id, packet.manifest, { ...inspected }],
	]) await assert.rejects(unpackNote(otherKeys, workspace, id, address, load, info), /Verified manifest/);
	const corrupted = async address => address === packet.manifest ? load(address) : new Uint8Array(objects.get(address).length);
	await assert.rejects(unpackNote(keys, 'workspace-a', packet.id, packet.manifest, corrupted, inspected), /digest mismatch/);
});
