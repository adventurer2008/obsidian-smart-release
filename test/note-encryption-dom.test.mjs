import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { registerHooks } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createLocked, openLocked, updateLocked, lockedMarker, lockedRanges } from '../src/note-crypto.js';

const domErrors = [], console = new VirtualConsole();
console.on('jsdomError', error => domErrors.push(error.message));
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://127.0.0.1/', virtualConsole: console });
for (const key of ['window', 'document', 'Window', 'Element', 'Document', 'MutationObserver', 'HTMLElement', 'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'])
	Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? dom.window : key === 'document' ? dom.window.document : typeof dom.window[key] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? dom.window[key].bind(dom.window) : dom.window[key] });
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
const proto = dom.window.HTMLElement.prototype;
proto.empty = function () { this.replaceChildren(); };
proto.setText = function (text) { this.textContent = text; };
proto.addClass = function (...names) { this.classList.add(...names); };
proto.createEl = function (tag, options = {}) {
	const el = document.createElement(tag);
	if (options.text !== undefined) el.textContent = options.text;
	if (options.cls) el.className = options.cls;
	for (const key of ['type', 'value', 'placeholder']) if (options[key] !== undefined) el[key] = options[key];
	for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
	this.appendChild(el); return el;
};
proto.createSpan = function (options) { return this.createEl('span', options); };
proto.createDiv = function (options) { return this.createEl('div', options); };
registerHooks({ resolve(specifier, context, next) {
	return specifier === 'obsidian' ? { url: new URL('./encryption-dom-sdk.mjs', import.meta.url).href, shortCircuit: true } : next(specifier, context);
} });
const { NoteEncryption, encryptionExtension } = await import('../src/note-encryption.js');
const { editorInfoField, modals, menus, Platform } = await import('./encryption-dom-sdk.mjs');
const { EditorState } = await import('@codemirror/state');
const { EditorView } = await import('@codemirror/view');
after(() => { dom.window.close(); assert.deepEqual(domErrors, [], 'DOM/CodeMirror asynchronous errors must not be ignored'); });

test('reading view selection menu preserves copy and encrypts only an exact unambiguous source range', async () => {
	const container = document.body.createDiv(), preview = container.createDiv({ cls: 'markdown-preview-view' });
	const paragraph = preview.createEl('p', { text: '请选中这段测试文字，右键加密。' });
	const file = { path: 'reading.md' }; let source = paragraph.textContent, changedMode;
	const leaf = { view: { file, containerEl: container, editor: { getValue: () => source } },
		getViewState: () => ({ type: 'markdown', state: { file: file.path, mode: 'preview' } }),
		setViewState: async state => { changedMode = state.state.mode; } };
	const manager = new NoteEncryption({ app: { vault: { configDir: '.fixture' }, workspace: { getLeavesOfType: () => [leaf] } }, manifest: { id: 'test' } });
	manager.document = document;
	let captured; manager.encrypt = (snapshot, kind) => { captured = { snapshot, kind }; };
	const range = document.createRange(); range.setStart(paragraph.firstChild, 3); range.setEnd(paragraph.firstChild, 9);
	const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
	const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
	const listener = event => manager.readingMenu(event); document.addEventListener('contextmenu', listener, true);
	try {
		paragraph.dispatchEvent(event);
		assert.equal(event.defaultPrevented, true);
		assert.deepEqual(menus.at(-1).items.map(item => item.title), ['复制', '加密所选文本']);
		await menus.at(-1).items[1].callback(); await Promise.resolve();
		assert.equal(captured.kind, 'text');
		assert.equal(captured.snapshot.original.slice(captured.snapshot.from, captured.snapshot.to), selection.toString());
		captured = undefined; source = '重复 重复';
		await manager.encryptReadingSelection(leaf, '重复', source);
		assert.equal(captured, undefined); assert.equal(changedMode, 'source');
		source = '含 **格式** 的文字';
		await manager.encryptReadingSelection(leaf, '含 格式 的文字', source);
		assert.equal(captured, undefined);
		await assert.rejects(manager.encryptReadingSelection(leaf, '文字', '已过期'), /笔记已修改/);
		await assert.rejects(manager.encryptReadingSelection(leaf, '文字', source, { path: 'another.md' }), /笔记已切换/);
		preview.classList.add('wujie-encrypted'); paragraph.classList.add('wujie-encrypted');
		const protectedEvent = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }); paragraph.dispatchEvent(protectedEvent);
		assert.equal(protectedEvent.defaultPrevented, false, 'unlocked plaintext must not map into ordinary source');
	} finally { manager.closeActions(); selection.removeAllRanges(); document.removeEventListener('contextmenu', listener, true); container.remove(); }
});
const password = 'actual DOM fixture password';

async function fixture(kind = 'text', original = '初始秘密') {
	const box = await createLocked(original, password, '公开的提示', kind);
	let disk = kind === 'text' ? '前文 ' + lockedMarker(box) + ' 后文' : lockedMarker(box);
	const file = { path: 'Visible title.md', stat: { mtime: 1577836800123 } }, drafts = new Map(), dirs = new Set();
	let view;
	const editor = {
		getValue: () => view.state.doc.toString(),
		getCursor: direction => direction === 'from' ? view.state.selection.main.from : view.state.selection.main.to,
		posToOffset: value => value,
	};
	const info = { file, editor };
	globalThis.encryptionEditorInfo = info;
	const app = {
		vault: { configDir: '.fixture', read: async () => disk, getAbstractFileByPath: path => path === file.path ? file : null,
			process: async (_file, change, options) => {
				disk = change(disk); file.stat.mtime = options?.mtime ?? Date.now();
				view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: disk } });
				return disk;
			},
			adapter: { exists: async path => dirs.has(path) || drafts.has(path), mkdir: async path => dirs.add(path), write: async (path, raw) => drafts.set(path, raw), remove: async path => drafts.delete(path) },
		},
		workspace: { getLeavesOfType: () => [{ view: { file, editor } }] },
	};
	const manager = new NoteEncryption({ app, manifest: { id: 'wujie-sync' }, data: {} });
	const container = document.body.createDiv();
	view = new EditorView({ state: EditorState.create({ doc: disk, extensions: [editorInfoField, encryptionExtension(manager)] }), parent: container });
	return { manager, view, file, box, container, drafts, read: () => disk, dispose() { manager.dispose(); view.destroy(); container.remove(); } };
}
async function submit() {
	const prompt = modals.at(-1); prompt.password.value = password; await prompt.run(); assert.equal(prompt.closed, true);
}

test('real CodeMirror DOM replaces inline and multiline full-note ciphertext with clickable lock controls', async () => {
	for (const kind of ['text', 'note']) {
		const value = await fixture(kind);
		try {
			assert.ok(value.container.textContent.includes(kind === 'note' ? '此笔记已加密' : '加密内容'));
			assert.ok(!value.container.textContent.includes('wujie-lock:') && !value.container.textContent.includes('初始秘密'));
			assert.ok(value.read().includes(kind === 'note' ? 'wujie-encrypted' : 'wujie-lock:'));
			value.container.querySelector('.wujie-encrypted button').click(); await submit();
			assert.ok(value.container.textContent.includes('初始秘密'));
			assert.ok(!value.read().includes('初始秘密'));
		} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); }
	}
});

test('actual DOM auto-save keeps the same decrypted widget/input alive across host editor reloads and locks the updated ciphertext', async () => {
	const value = await fixture();
	try {
		value.container.querySelector('.wujie-encrypted button').click(); await submit();
		const session = [...value.manager.sessions][0]; value.manager.editSession(session);
		const input = session.input; input.value = '第一版修改'; input.dispatchEvent(new dom.window.Event('input'));
		await value.manager.queueSave(session);
		assert.ok(input.isConnected, 'host reload must not replace the active secure editor');
		assert.equal(session.locked, undefined);
		input.value = '第二版中文👩‍💻'; input.dispatchEvent(new dom.window.Event('input')); await value.manager.queueSave(session);
		assert.equal(session.input, input);
		assert.equal((await openLocked(lockedRanges(value.read())[0].box, password)).text, '第二版中文👩‍💻');
		await value.manager.lock(session);
		assert.equal(input.value, ''); assert.equal(session.key, undefined);
		assert.ok(!value.container.textContent.includes('第二版中文'));
		assert.equal(value.drafts.size, 0);
	} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); }
});

test('partial ciphertext edits are rejected while deleting a whole encrypted block remains possible', async () => {
	const value = await fixture();
	try {
		const original = value.view.state.doc.toString(), [range] = lockedRanges(original);
		value.view.dispatch({ changes: { from: range.from + 20, to: range.from + 21, insert: 'X' } });
		assert.equal(value.view.state.doc.toString(), original);
		value.view.dispatch({ changes: { from: range.from, to: range.to, insert: '' } });
		assert.equal(value.view.state.doc.toString(), '前文  后文');
	} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); }
});

test('a remote replacement locks the old session without redrawing its stale ciphertext controls', async () => {
	for (const sameObject of [true, false]) {
	const value = await fixture();
	try {
		value.container.querySelector('.wujie-encrypted button').click(); await submit();
		const old = [...value.manager.sessions][0];
		const replacement = sameObject ? await updateLocked(old.box, old.key, '远端新内容') : await createLocked('远端新内容', password);
		await value.manager.app.vault.process(value.file, current => current.replace(old.marker, lockedMarker(replacement)));
		await Promise.all(value.manager.pendingWrites);
		assert.equal(old.key, undefined); assert.equal(value.manager.sessions.size, 0);
		assert.ok(!value.container.textContent.includes('初始秘密'));
		value.container.querySelector('.wujie-encrypted button').click(); await submit();
		assert.equal([...value.manager.sessions][0].text, '远端新内容');
	} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); }
	}
});

test('an unwritable ciphertext journal reports failure and a successful retry clears the volatile draft', async () => {
	const value = await fixture();
	try {
		value.container.querySelector('.wujie-encrypted button').click(); await submit();
		const session = [...value.manager.sessions][0]; value.manager.editSession(session);
		const adapter = value.manager.app.vault.adapter, originalWrite = adapter.write, original = value.read();
		adapter.write = async () => { throw Error('synthetic disk full'); };
		session.input.value = '需要重试的秘密'; session.input.dispatchEvent(new dom.window.Event('input'));
		await value.manager.queueSave(session);
		assert.equal(value.read(), original); assert.equal(session.failed, true);
		assert.equal(value.manager.volatileDrafts.size, 1);
		assert.ok(session.status.textContent.includes('尚未确认保存'));
		adapter.write = originalWrite;
		await value.manager.queueSave(session);
		assert.equal(session.failed, false); assert.equal(value.manager.volatileDrafts.size, 0);
		assert.equal((await openLocked(lockedRanges(value.read())[0].box, password)).text, '需要重试的秘密');
		await value.manager.lock(session); assert.equal(session.key, undefined);
	} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); }
});

test('mobile selection action appears only with a selection and retains the selected range while opening the password form', async () => {
	Platform.isMobile = true;
	const value = await fixture();
	try {
		assert.equal(value.container.querySelector('.wujie-encryption-selection-tools'), null);
		value.view.dispatch({ selection: { anchor: 0, head: 2 } });
		const action = value.container.querySelector('.wujie-encryption-selection-tools button'); assert.ok(action);
		action.click(); await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(modals.at(-1).titleText, '加密所选文本');
		assert.equal(modals.at(-1).password.getAttribute('aria-label'), '密码（至少4个字符）');
		assert.equal(value.view.state.selection.main.from, 0); assert.equal(value.view.state.selection.main.to, 2);
		modals.at(-1).close();
	} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); Platform.isMobile = false; }
});

test('inline locks and unlocked plaintext keep actions outside the document; desktop native menu closes on lock', async () => {
	const value = await fixture();
	try {
		const area = value.container.querySelector('.wujie-encrypted');
		area.querySelector('.wujie-crypto-more').click();
		assert.deepEqual(menus.at(-1).items.map(item => item.title), ['解锁', '修改密码', '永久解密']);
		assert.equal(area.querySelector('.wujie-crypto-menu'), null);
		value.manager.closeActions();
		area.querySelector('button').click(); await submit();
		assert.ok(area.classList.contains('is-open'));
		assert.equal(area.querySelector('pre'), null);
		assert.equal(area.querySelectorAll('button').length, 1, 'only a discreet more trigger stays in the sentence');
		area.querySelector('.wujie-decrypted-text').click();
		assert.deepEqual(menus.at(-1).items.map(item => item.title), ['编辑', '锁定', '修改密码', '永久解密']);
		assert.ok(!area.textContent.includes('永久解密'));
		await value.manager.lock([...value.manager.sessions][0]);
		assert.equal(menus.at(-1).visible, false);
	} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); }
});

test('touch actions use a modal bottom sheet and opening a password form removes the action sheet', async () => {
	Platform.isMobile = true; const value = await fixture();
	try {
		const area = value.container.querySelector('.wujie-encrypted');
		area.querySelector('.wujie-crypto-more').click();
		const sheet = modals.at(-1);
		assert.ok(sheet.modalEl.classList.contains('wujie-crypto-sheet'));
		assert.equal(area.querySelector('.wujie-crypto-sheet'), null);
		assert.deepEqual([...sheet.contentEl.querySelectorAll('button')].map(el => el.textContent), ['解锁', '修改密码', '永久解密', '取消']);
		sheet.contentEl.querySelector('button').click();
		assert.equal(sheet.modalEl.isConnected, false);
		assert.equal(modals.at(-1).titleText, '解锁'); modals.at(-1).close();
		area.querySelector('.wujie-crypto-more').click(); value.manager.lockAll();
		assert.equal(modals.at(-1).modalEl.isConnected, false);
	} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); Platform.isMobile = false; }
});

test('nested encrypted blocks unlock separately and inner edits survive outer encryption save and recursive lock', async () => {
	const inner = await createLocked('内层原文', password);
	const value = await fixture('note', '外层文字 ' + lockedMarker(inner));
	try {
		value.container.querySelector('.wujie-encrypted button').click(); await submit();
		const outer = [...value.manager.sessions][0];
		const innerArea = outer.area.querySelector('.wujie-encrypted'); assert.ok(innerArea);
		innerArea.querySelector('button').click(); await submit();
		const nested = [...value.manager.sessions].find(session => session.parentSession === outer); assert.ok(nested);
		assert.equal(nested.text, '内层原文');
		value.manager.editSession(nested); nested.input.value = '内层新内容'; nested.input.dispatchEvent(new dom.window.Event('input'));
		await value.manager.editSession(outer);
		assert.equal(nested.key, undefined, 'outer editing must flush and lock nested editors first');
		assert.equal((await openLocked(lockedRanges(outer.input.value)[0].box, password)).text, '内层新内容');
		await value.manager.lock(outer);
		assert.equal(value.manager.sessions.size, 0); assert.equal(outer.key, undefined); assert.equal(nested.key, undefined);
		const outerText = (await openLocked(lockedRanges(value.read())[0].box, password)).text;
		assert.ok(!outerText.includes('内层新内容'));
		assert.equal((await openLocked(lockedRanges(outerText)[0].box, password)).text, '内层新内容');
	} finally { value.dispose(); await Promise.all(value.manager.pendingWrites); }
});
