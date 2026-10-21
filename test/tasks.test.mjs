import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskJournal } from '../src/tasks.js';
import { responseBytes } from '../src/client.js';

const scope = 'a'.repeat(64),
	note = 'b'.repeat(64);
test('large sync keeps its running cycle inside the bounded journal until a terminal result can be reported', () => {
	const journal = new TaskJournal();
	const cycle = journal.start(scope, { note: scope, direction: 'cycle' });
	for (let index = 0; index < 1200; index++) {
		const id = journal.start(scope, { note, direction: 'receive' });
		journal.update(id, { status: 'done' });
	}
	assert.equal(journal.rows.length, 500);
	assert.equal(journal.rows[0].id, cycle);
	journal.update(cycle, { status: 'done' });
	assert.equal(journal.rows[0].status, 'done');
	journal.start(scope, { note, direction: 'receive' });
	assert.equal(journal.rows.some(row => row.id === cycle), false);
	assert.equal(journal.rows.length, 500);
});
test('task timing persists only bounded numeric work and checkpoint intervals and tolerates legacy rows', () => {
	const journal = new TaskJournal();
	const id = journal.start(scope, { note, direction: 'receive' });
	journal.update(id, { status: 'done', workMilliseconds: 12.5, checkpointMilliseconds: 80, path: 'private.md', secretTiming: 'secret' });
	const restored = new TaskJournal(journal.snapshot()).rows[0];
	assert.equal(restored.workMilliseconds, 12.5);
	assert.equal(restored.checkpointMilliseconds, 80);
	assert.equal(JSON.stringify(restored).includes('private'), false);
	assert.equal(JSON.stringify(restored).includes('secret'), false);
	for (const value of [-1, Infinity, '12', 1e13]) {
		const invalid = new TaskJournal([{ ...restored, workMilliseconds: value }]).rows[0];
		assert.equal(invalid.workMilliseconds, undefined);
	}
	const legacy = { ...restored };
	delete legacy.workMilliseconds;
	delete legacy.checkpointMilliseconds;
	assert.equal(new TaskJournal([legacy]).rows[0].workMilliseconds, undefined);
});
test('task snapshots whitelist fields, isolate workspaces and recover interrupted tasks without names or raw errors', () => {
	const journal = new TaskJournal();
	const id = journal.start(scope, {
		note,
		direction: 'send',
		path: 'private.md',
		accessKey: 'secret',
	});
	journal.update(id, {
		path: 'private.md',
		status: 'progress',
		bytes: 8,
		total: 10,
		secret: 'secret',
	});
	const snapshot = journal.snapshot();
	assert.equal(JSON.stringify(snapshot).includes('private'), false);
	assert.equal(JSON.stringify(snapshot).includes('secret'), false);
	const restored = new TaskJournal(JSON.parse(JSON.stringify(snapshot)));
	assert.equal(restored.select(scope)[0].status, 'interrupted');
	assert.equal(restored.names.size, 0);
	assert.equal(restored.select('c'.repeat(64)).length, 0);
	assert.equal(restored.canRetry(restored.rows[0], 'c'.repeat(64)), false);
	journal.update(id, { status: 'failed', error: new Error('Bearer secret private.md') });
	assert.equal(journal.message(journal.rows[0]).includes('secret'), false);
	assert.equal(journal.rows[0].status, 'failed');
});
test('task filtering, bounded retention and later completion resolve failures in only the same workspace', () => {
	const journal = new TaskJournal();
	const fail = journal.start(scope, { note, direction: 'receive' });
	journal.update(fail, { status: 'failed', error: { status: 409 }, path: 'note.md' });
	const other = journal.start('c'.repeat(64), { note, direction: 'receive' });
	journal.update(other, { status: 'failed' });
	assert.equal(journal.select(scope, { status: 'pending', search: 'NOTE' }).length, 1);
	assert.equal(journal.select(scope, { direction: 'send' }).length, 0);
	const done = journal.start(scope, { note, direction: 'receive' });
	journal.update(done, { status: 'done', bytes: 20 });
	assert.equal(journal.rows.find((row) => row.id === fail).status, 'resolved');
	assert.equal(journal.rows.find((row) => row.id === other).status, 'failed');
	for (let i = 0; i < 505; i++) journal.start(scope, { note, direction: 'send' });
	assert.equal(journal.snapshot().length, 500);
});
test('stream progress reports actual chunks and never bypasses the response size limit', async () => {
	const reports = [];
	const response = new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2]));
				controller.enqueue(new Uint8Array([3, 4, 5]));
				controller.close();
			},
		}),
		{ headers: { 'content-length': '5' } },
	);
	assert.equal((await responseBytes(response, 5, (event) => reports.push(event))).length, 5);
	assert.deepEqual(reports, [
		{ loaded: 2, total: 5 },
		{ loaded: 5, total: 5 },
	]);
	let cancelled = false;
	const oversized = new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(8));
			},
			cancel() {
				cancelled = true;
			},
		}),
	);
	await assert.rejects(responseBytes(oversized, 4), /allowed size/);
	assert.equal(cancelled, true);
});
