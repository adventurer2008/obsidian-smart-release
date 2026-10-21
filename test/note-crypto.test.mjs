import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocked, openLocked, updateLocked, rewrapLocked, lockedMarker, lockedRanges, searchableText, encodeBox, decodeBox, NOTE_LIMIT, replaceLocked } from '../src/note-crypto.js';
import { mergeNote, rememberBase } from '../src/merge.js';

const password = '独立的笔记密码-2026!';
const original = '---\ntags: [保密]\n---\n# 正文\n中文👨‍👩‍👧‍👦\r\n\n|甲|乙|\n|-|-|\n|秘密|测试|\n```js\nlet n = 1;\n```\n';
let fixture;
const box = async () => fixture ??= await createLocked(original, password, '不是密码的提示', 'note');

test('whole-note encrypted file has no clear body and preserves exact Unicode, CRLF, properties and Markdown', async () => {
	const encrypted = await box(), marker = lockedMarker(encrypted);
	assert.ok(!marker.includes('保密') && !marker.includes('正文'));
	assert.equal(encrypted.kind, 'note');
	assert.equal((await openLocked(encrypted, password)).text, original);
	const parsed = lockedRanges(marker);
	assert.equal(parsed.length, 1); assert.deepEqual(parsed[0].box, encrypted);
	assert.equal(parsed[0].marker, marker);
	assert.deepEqual(decodeBox(encodeBox(encrypted)), encrypted);
});

test('fresh salt, identity, nonces and random data key prevent same text/password equality', async () => {
	const a = await createLocked('same', password), b = await createLocked('same', password);
	for (const key of ['salt', 'id', 'wrapIV', 'wrappedKey', 'iv', 'body']) assert.notEqual(a[key], b[key], key);
});

test('wrong password and authenticated metadata, payload, wrap and mode tampering fail closed', async t => {
	const encrypted = await box();
	await assert.rejects(openLocked(encrypted, 'a wrong password'), /密码不正确/);
	for (const key of ['hint', 'kind', 'id', 'salt', 'wrapIV', 'wrappedKey', 'iv', 'size', 'body']) await t.test(key, async () => {
		const changed = structuredClone(encrypted);
		if (key === 'hint') changed[key] += 'modified';
		else if (key === 'kind') changed[key] = 'text';
		else if (key === 'id') changed[key] = '0'.repeat(32);
		else if (key === 'size') changed[key]++;
		else changed[key] = (changed[key][0] === 'A' ? 'B' : 'A') + changed[key].slice(1);
		await assert.rejects(openLocked(changed, password), /密码不正确/);
	});
});

test('parser rejects unsupported versions, excessive KDF, size, hint, extra fields and malformed base64 before opening', async () => {
	const encrypted = await box();
	for (const override of [{ v: 2 }, { rounds: 2147483647 }, { size: NOTE_LIMIT + 1 }, { size: -1 }, { hint: 'a'.repeat(201) }, { salt: '!' }, { wrappedKey: '' }, { unexpected: true }])
		assert.throws(() => encodeBox({ ...encrypted, ...override }));
	for (const value of ['', '!', 'a'.repeat(4 * 1024 * 1024 + 1)]) assert.throws(() => decodeBox(value));
	await assert.rejects(createLocked('a', 'abc'), /至少4/);
	await assert.rejects(createLocked('a'.repeat(NOTE_LIMIT + 1), password), /超过2 MB/);
});

test('four-character passwords create whole-note and selected-text locks and can be used for password rotation', async () => {
	for (const kind of ['note', 'text']) {
		const encrypted = await createLocked('四字密码正文', '1234', '', kind);
		assert.equal((await openLocked(encrypted, '1234')).text, '四字密码正文');
		await assert.rejects(rewrapLocked(encrypted, '1234', 'abc'), /至少4/);
		const changed = await rewrapLocked(encrypted, '1234', '四字密码');
		assert.equal((await openLocked(changed, '四字密码')).text, '四字密码正文');
		await assert.rejects(openLocked(changed, '1234'));
	}
});

test('in-memory non-extractable session key saves only fresh encrypted payloads, including empty text', async () => {
	const encrypted = await box(), opened = await openLocked(encrypted, password);
	assert.equal(opened.key.extractable, false);
	const updated = await updateLocked(encrypted, opened.key, '真实新内容🪷');
	assert.equal(updated.wrappedKey, encrypted.wrappedKey);
	assert.notEqual(updated.iv, encrypted.iv);
	assert.equal((await openLocked(updated, password)).text, '真实新内容🪷');
	assert.equal((await openLocked(await updateLocked(updated, opened.key, ''), password)).text, '');
});

test('password rotation rewraps the data key, leaves payload untouched, and invalidates the old password for the new file', async () => {
	const encrypted = await box();
	const next = await rewrapLocked(encrypted, password, 'a different long password', '新提示');
	assert.equal(next.body, encrypted.body); assert.equal(next.iv, encrypted.iv);
	assert.notEqual(next.salt, encrypted.salt); assert.notEqual(next.wrappedKey, encrypted.wrappedKey);
	assert.equal((await openLocked(next, 'a different long password')).text, original);
	await assert.rejects(openLocked(next, password));
});

test('selected text encrypts at exact inline offsets, survives multiline selection and excludes hints from searchable body', async () => {
	const selected = '跨行\n中文秘密🪷';
	const encrypted = await createLocked(selected, password, 'PUBLIC-HINT');
	const marker = lockedMarker(encrypted), document = '前文 ' + marker + ' 后文';
	const [range] = lockedRanges(document);
	assert.equal(range.from, 3); assert.equal(document.slice(range.from, range.to), marker);
	assert.equal((await openLocked(range.box, password)).text, selected);
	const searchable = searchableText(document);
	assert.equal(searchable.length, document.length); assert.equal(searchable.indexOf('后文'), document.indexOf('后文'));
	assert.ok(!searchable.includes('PUBLIC-HINT') && !searchable.includes('wujie-lock'));
	assert.equal(searchable.slice(0, 3), '前文 ');
	const damaged = marker.replace('v1:', 'v1:AAAA');
	assert.equal(lockedRanges(damaged)[0].box, undefined);
	assert.ok(!searchableText(damaged).includes('AAAA'));
});

test('representation conversion preserves source mtime; real edits use host time; atomic conflict and cancellation leave source intact', async () => {
	let disk = 'original', written;
	const vault = { process: async (_file, change, options) => { disk = change(disk); written = options; return disk; } };
	await replaceLocked(vault, {}, 'original', 'cipher', 1577836800123);
	assert.equal(disk, 'cipher'); assert.deepEqual(written, { mtime: 1577836800123 });
	await assert.rejects(replaceLocked(vault, {}, 'stale', 'lost update', 0)); assert.equal(disk, 'cipher');
	await assert.rejects(replaceLocked(vault, {}, 'cipher', 'cancelled', 0, () => false)); assert.equal(disk, 'cipher');
	await replaceLocked(vault, {}, 'cipher', 'new cipher'); assert.equal(written, undefined);
});

test('encrypted documents are not text-merged and do not enter persisted plaintext merge bases', async () => {
	const marker = lockedMarker(await box()), enc = text => new TextEncoder().encode(text);
	assert.equal(mergeNote('base', enc(marker), enc('remote')), undefined);
	assert.equal(mergeNote(marker, enc('local'), enc('remote')), undefined);
	const state = { notes: { id: { path: 'Secret.md', base: 'old plaintext' } } };
	rememberBase(state, 'id', enc(marker)); assert.equal(state.notes.id.base, undefined);
	rememberBase(state, 'id', enc('late pre-encryption upload completion')); assert.equal(state.notes.id.base, undefined);
	assert.equal(new TextDecoder().decode(mergeNote('a\nb\nc', enc('A\nb\nc'), enc('a\nb\nC'))), 'A\nb\nC');
});

test('compression fallback on legacy WebViews interoperates with native stream decoding', async () => {
	const native = globalThis.CompressionStream;
	let encrypted;
	try { globalThis.CompressionStream = undefined; encrypted = await createLocked('旧iOS中文'.repeat(5000), password); }
	finally { globalThis.CompressionStream = native; }
	assert.equal((await openLocked(encrypted, password)).text, '旧iOS中文'.repeat(5000));
});
