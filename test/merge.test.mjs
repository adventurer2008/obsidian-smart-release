import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeNote, rememberBase } from '../src/merge.js';

const enc = new TextEncoder(),
	dec = new TextDecoder();
test('non-overlapping Markdown edits merge while overlapping edits remain conflicts', () => {
	const base = 'first\nsecond\nthird\n';
	const merged = mergeNote(
		base,
		enc.encode('first local\nsecond\nthird\n'),
		enc.encode('first\nsecond\nthird remote\n'),
	);
	assert.equal(dec.decode(merged), 'first local\nsecond\nthird remote\n');
	assert.equal(
		mergeNote(base, enc.encode('A\nsecond\nthird\n'), enc.encode('B\nsecond\nthird\n')),
		undefined,
	);
});
test('base cache is bounded and does not cache oversized or binary notes', () => {
	const state = { notes: {} };
	for (let i = 0; i < 20; i++) {
		state.notes[i] = { path: `${i}.md` };
		rememberBase(state, String(i), new Uint8Array(262144).fill(65));
	}
	const total = Object.values(state.notes).reduce(
		(size, note) => size + (note.base?.length ?? 0),
		0,
	);
	assert.ok(total <= 4 * 1024 * 1024);
	state.notes.large = { path: 'large.md' };
	rememberBase(state, 'large', new Uint8Array(262145));
	assert.equal(state.notes.large.base, undefined);
});

test('base cache indexes existing entries once, maintains byte limits for Unicode and rebuilds after a state replacement', () => {
	let scans = 0;
	const notes = new Proxy({}, { ownKeys(target) { scans++; return Reflect.ownKeys(target); } });
	const state = { notes };
	for (let i = 0; i < 300; i++) {
		state.notes[i] = { path: `${i}.md` };
		rememberBase(state, String(i), enc.encode('中文'.repeat(4096)));
	}
	assert.equal(scans, 1);
	assert.ok(Object.values(state.notes).reduce((sum, note) => sum + enc.encode(note.base ?? '').length, 0) <= 4 * 1024 * 1024);
	state.notes = { imported: { path: 'imported.md', base: 'before', baseAt: 0 } };
	rememberBase(state, 'imported', enc.encode('after'));
	assert.equal(state.notes.imported.base, 'after');
});
