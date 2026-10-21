import { Modal, Menu, Notice, Platform, editorInfoField } from 'obsidian';
import { StateField, EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, ViewPlugin } from '@codemirror/view';
import { formatStorageSize } from './i18n.js';
import {
	createLocked, openLocked, updateLocked, rewrapLocked, lockedMarker, lockedRanges,
	decodeBox, encodeBox, replaceLocked, TEXT_PREFIX, containsLockedText, NOTE_LIMIT,
} from './note-crypto.js';

const failure = error => new Notice(error instanceof Error ? error.message : '加密操作失败，原文件未被解密覆盖。');
const button = (area, text, callback) => {
	const el = area.createEl('button', { text, attr: { type: 'button' } });
	el.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); callback(); });
	return el;
};
const fileIsNote = file => typeof file?.path === 'string' && file.path.toLowerCase().endsWith('.md');
const safeId = id => typeof id === 'string' && /^[a-f0-9]{32}$/u.test(id);

class PasswordWindow extends Modal {
	constructor(manager, title, box, creating, submit) {
		super(manager.app);
		Object.assign(this, { manager, titleText: title, box, creating, submit });
	}
	onOpen() {
		this.manager.prompts.add(this);
		this.setTitle(this.titleText);
		this.contentEl.addClass('wujie-crypto-form');
		const field = (label, type, max) => {
			const row = this.contentEl.createEl('label', { text: label });
			const input = row.createEl('input', { type, attr: { 'aria-label': label, maxlength: String(max), autocomplete: type === 'password' ? 'off' : 'off', autocapitalize: 'off', spellcheck: 'false' } });
			return input;
		};
		this.password = field(this.creating ? '密码（至少4个字符）' : '密码', 'password', 1024);
		if (this.creating) {
			this.confirm = field('确认密码', 'password', 1024);
			this.hint = field('密码提示（可选，未加密）', 'text', 200);
			this.hint.value = this.box?.hint ?? '';
			this.contentEl.createEl('p', { text: '密码不会上传，忘记后无法代找回。标题仍可见，引用的图片和附件不会自动加密。加密前的历史与备份可能仍保留原文。' });
		} else if (this.box?.hint) {
			button(this.contentEl, '查看密码提示', () => {
				if (!this.hintShown) { this.hintShown = true; this.contentEl.createEl('p', { text: this.box.hint }); }
			});
		}
		if (this.titleText === '永久解密') this.contentEl.createEl('p', { text: '永久解密后，原文将作为普通文字保存在本地，并随笔记同步。' });
		this.status = this.contentEl.createDiv({ attr: { role: 'status', 'aria-live': 'polite' } });
		this.submitButton = button(this.contentEl, this.creating ? '加密' : this.titleText, () => { void this.run(); });
		button(this.contentEl, '取消', () => this.close());
		this.password.focus();
	}
	async run() {
		if (this.busy || this.closed) return;
		if (this.creating && this.password.value !== this.confirm.value) { this.status.setText('两次输入的密码不一致。'); return; }
		this.busy = true; this.submitButton.disabled = true;
		const epoch = this.manager.epoch;
		try {
			await this.submit(this.password.value, this.hint?.value ?? '', () => !this.closed && this.manager.active(epoch));
			if (!this.closed) this.close();
		} catch (error) {
			if (!this.closed) this.status.setText(error instanceof Error ? error.message : '操作失败，请重试。');
		} finally {
			this.password.value = ''; if (this.confirm) this.confirm.value = '';
			this.busy = false; this.submitButton.disabled = false;
		}
	}
	onClose() {
		this.closed = true;
		if (this.password) this.password.value = '';
		if (this.confirm) this.confirm.value = '';
		this.submit = undefined;
		this.contentEl.empty();
		this.manager.prompts.delete(this);
	}
}

class EncryptionActions extends Modal {
	constructor(manager, actions) { super(manager.app); this.manager = manager; this.actions = actions; }
	onOpen() {
		this.setTitle('加密内容');
		this.containerEl?.addClass('wujie-crypto-sheet-container');
		this.modalEl?.addClass('wujie-crypto-sheet');
		this.contentEl.addClass('wujie-crypto-sheet-actions');
		for (const [title, , action] of this.actions) button(this.contentEl, title, () => { this.close(); action(); });
		button(this.contentEl, '取消', () => this.close());
	}
	onClose() { this.contentEl.empty(); if (this.manager.actionMenu === this) this.manager.actionMenu = undefined; }
}

export class NoteEncryption {
	constructor(owner) {
		this.owner = owner; this.app = owner.app; this.epoch = 0;
		this.prompts = new Set(); this.sessions = new Set(); this.stopped = false;
		this.pendingWrites = new Set(); this.busyFiles = new Set(); this.locks = new Map(); this.areas = new WeakMap();
		this.volatileDrafts = new Map();
		this.recoveryDir = `${this.app.vault.configDir}/plugins/${owner.manifest.id}/encrypted-drafts`;
	}
	active(epoch) { return !this.stopped && epoch === this.epoch && !this.document?.hidden; }
	async capture(file, editor) {
		if (!fileIsNote(file)) throw Error('请先打开一篇Markdown笔记。');
		const leaves = this.app.workspace.getLeavesOfType('markdown').filter(leaf => leaf.view?.file === file);
		const view = leaves.find(leaf => leaf.view.editor === editor)?.view ?? leaves[0]?.view;
		const original = view?.editor?.getValue() ?? await this.app.vault.read(file);
		let from = 0, to = original.length;
		if (editor) {
			from = editor.posToOffset(editor.getCursor('from')); to = editor.posToOffset(editor.getCursor('to'));
			if (from === to) throw Error('请先选中要加密的文字。');
		}
		return { file, original, from, to, path: file.path };
	}
	async encryptSelection(editor, file = this.app.workspace.getActiveFile()) {
		const snapshot = await this.capture(file, editor);
		if (!editor) throw Error('请先在编辑模式选中文字，再执行加密所选文本。');
		return this.encrypt(snapshot, 'text');
	}
	readingMenu(event) {
		if (Platform.isMobile || this.stopped) return;
		const preview = event.target?.closest?.('.markdown-preview-view');
		const selection = this.document?.getSelection();
		if (!preview || !selection || selection.isCollapsed || selection.rangeCount !== 1) return;
		const range = selection.getRangeAt(0);
		if (!preview.contains(range.startContainer) || !preview.contains(range.endContainer)) return;
		if ([...preview.querySelectorAll('.wujie-encrypted')].some(area => range.intersectsNode(area))) return;
		const leaf = this.app.workspace.getLeavesOfType('markdown').find(leaf => leaf.view?.containerEl?.contains(preview));
		if (!fileIsNote(leaf?.view.file)) return;
		const text = selection.toString(), original = leaf.view.editor?.getValue(), file = leaf.view.file;
		if (!text.trim() || typeof original !== 'string') return;
		event.preventDefault(); event.stopPropagation(); this.closeActions();
		const menu = new Menu(); this.actionMenu = menu;
		menu.addItem(item => item.setTitle('复制').setIcon('copy').onClick(() => {
			this.closeActions();
			const clipboard = this.document.defaultView.navigator.clipboard;
			if (clipboard) void clipboard.writeText(text).catch(failure);
			else new Notice('无法复制，请使用系统复制快捷键。');
		}));
		menu.addItem(item => item.setTitle('加密所选文本').setIcon('lock').onClick(() => {
			this.closeActions(); void this.encryptReadingSelection(leaf, text, original, file).catch(failure);
		}));
		menu.showAtPosition({ x: event.clientX, y: event.clientY }, this.document);
	}
	async encryptReadingSelection(leaf, text, original, file = leaf.view.file) {
		if (leaf.view.file !== file) throw Error('笔记已切换，请重新选择后加密。');
		const snapshot = await this.capture(file);
		if (snapshot.original !== original || !text) throw Error('笔记已修改，请重新选择后加密。');
		const from = original.indexOf(text);
		if (from < 0 || original.indexOf(text, from + 1) >= 0) {
			const state = leaf.getViewState();
			await leaf.setViewState({ ...state, state: { ...state.state, mode: 'source' } });
			new Notice('已切换到编辑模式。选区含格式或重复文字，请重新选中要加密的文字。');
			return;
		}
		return this.encrypt({ ...snapshot, from, to: from + text.length }, 'text');
	}
	async encryptNote(file = this.app.workspace.getActiveFile()) {
		return this.encrypt(await this.capture(file), 'note');
	}
	encrypt(snapshot, kind) {
		const { original, from, to } = snapshot;
		const ranges = lockedRanges(original);
		if (ranges.some(range => range.box?.kind === 'note')) throw Error('整篇笔记已经加密，请先解锁。');
		if (kind === 'text' && ranges.some(range => range.from < to && range.to > from)) throw Error('选区包含加密块，请调整选区；已有加密块不能拆开或重复加密。');
		new PasswordWindow(this, kind === 'note' ? '加密整篇笔记' : '加密所选文本', undefined, true, async (password, hint, active) => {
			const box = await createLocked(original.slice(from, to), password, hint, kind);
			if (!active()) throw Error('操作已取消，请重新打开。');
			const next = original.slice(0, from) + lockedMarker(box) + original.slice(to);
			await this.convert(snapshot, next, active);
		}).open();
	}
	async convert(snapshot, next, active) {
		const { file, original, path } = snapshot;
		if (this.busyFiles.has(file)) throw Error('该笔记正在写入，请稍后重试。');
		this.busyFiles.add(file);
		const leaves = this.app.workspace.getLeavesOfType('markdown').filter(leaf => leaf.view?.file === file);
		const states = leaves.map(leaf => ({ leaf, state: leaf.getViewState() }));
		try {
			if (!active() || file.path !== path) throw Error('操作已取消或笔记已移动，请重试。');
			// Save existing edits first, then retire every editor/undo history before the cipher write.
			for (const { leaf } of states) {
				if (leaf.view.editor?.getValue() !== original) throw Error('笔记已修改，请重新选择后加密。');
				await leaf.view.save();
			}
			if (await this.app.vault.read(file) !== original) throw Error('笔记已更新，请重新打开后加密。');
			const mtime = file.stat.mtime;
			this.owner.cancelEditorSaves?.();
			for (const { leaf } of states) await leaf.setViewState({ type: 'empty' });
			await replaceLocked(this.app.vault, file, original, next, mtime, () => active() && file.path === path);
			await this.forgetOldPlaintext(path);
			new Notice('已加密，本地文件已保存密文。');
		} finally {
			try {
				for (const { leaf, state } of states) {
					if (leaf.view.getViewType?.() === 'empty') await leaf.setViewState(state);
				}
			} finally { this.busyFiles.delete(file); }
		}
	}
	async forgetOldPlaintext(path) {
		for (const state of Object.values(this.owner.data?.connections ?? {})) {
			state.localEncryption ??= {}; state.localEncryption[path] = true;
			for (const note of Object.values(state.notes ?? {})) if (note.path === path) { delete note.base; delete note.baseAt; }
		}
		for (const view of this.owner.noteSearchViews ?? []) { view.index.clear(); view.resultsEl?.empty(); view.schedule?.(0); }
		if (this.owner.data) await this.owner.saveData(this.owner.data);
	}
	renderLock(area, path, marker, box, parentSession) {
		this.areas.set(area, { path, marker, box, parentSession });
		area.addClass('wujie-encrypted');
		area.classList?.toggle('is-open', false); area.classList?.toggle('is-editing', false);
		area.classList?.toggle('is-whole-note', box?.kind === 'note');
		button(area, box?.kind === 'note' ? '🔒 此笔记已加密 · 解锁' : box ? '🔒 加密内容' : '🔒 加密内容损坏或格式不支持', () => {
			if (box) this.unlock(area, path, marker, box, parentSession);
		});
		if (box) {
			const more = event => {
				event?.preventDefault(); event?.stopPropagation();
				const target = { area, path, marker, box, parentSession, version: 0, saved: 0 };
				this.openActions(target, event);
			};
			const moreButton = button(area, '⋯', more); moreButton.addClass('wujie-crypto-more');
			moreButton.setAttribute?.('aria-label', '加密内容操作'); area.oncontextmenu = more;
		}
	}
	openActions(session, event) {
		event?.preventDefault(); event?.stopPropagation();
		this.closeActions();
		const unlocked = this.sessions.has(session) && !session.locked;
		const actions = unlocked ? [
			['编辑', 'pencil', () => this.editSession(session)], ['锁定', 'lock', () => this.lock(session)],
		] : [['解锁', 'unlock', () => this.unlock(session.area, session.path, session.marker, session.box, session.parentSession)]];
		actions.push(['修改密码', 'key-round', () => this.changePassword(session)], ['永久解密', 'unlock', () => this.permanent(session)]);
		if (Platform.isMobile) { const modal = new EncryptionActions(this, actions); this.actionMenu = modal; modal.open(); return; }
		const menu = new Menu(); this.actionMenu = menu;
		for (const [title, icon, action] of actions) menu.addItem(item => item.setTitle(title).setIcon(icon).onClick(() => { this.closeActions(); action(); }));
		const bounds = session.area.getBoundingClientRect();
		menu.showAtPosition({ x: event?.clientX || bounds.left, y: event?.clientY || bounds.bottom }, session.area.ownerDocument);
	}
	closeActions() { const menu = this.actionMenu; this.actionMenu = undefined; if (menu?.hide) menu.hide(); else menu?.close(); }
	unlock(area, path, marker, box, parentSession) {
		new PasswordWindow(this, '解锁', box, false, async (password, _hint, active) => {
			const opened = await openLocked(box, password);
			if (!active() || !area.isConnected) return;
			const file = this.app.vault.getAbstractFileByPath(path);
			const source = parentSession ? parentSession.locked ? '' : parentSession.text : file ? await this.app.vault.read(file) : '';
			const ranges = lockedRanges(source).filter(range => range.box?.id === box.id && encodeBox(range.box) === encodeBox(box));
			if (ranges.length !== 1 || !active()) throw Error('笔记已更新或加密块重复，请重新打开后解锁。');
			const session = { area, path, parentSession, marker: ranges[0].marker, box, key: opened.key, text: opened.text, epoch: this.epoch, lastUse: Date.now(), version: 0, saved: 0 };
			this.areas.set(area, session);
			this.sessions.add(session);
			this.showSession(session);
		}).open();
	}
	showSession(session) {
		const { area } = session;
		area.empty();
		area.classList?.toggle('is-open', true); area.classList?.toggle('is-editing', false);
		area.onpointerdown = () => { session.lastUse = Date.now(); };
		area.onkeydown = () => { session.lastUse = Date.now(); };
		const content = area.createSpan({ cls: 'wujie-decrypted-text', attr: { tabindex: '0', role: 'button', 'aria-label': '已解锁的加密内容，点击显示操作' } });
		let offset = 0;
		for (const range of lockedRanges(session.text)) {
			content.createSpan({ text: session.text.slice(offset, range.from) });
			this.renderLock(content.createSpan(), session.path, range.marker, range.box, session);
			offset = range.to;
		}
		content.createSpan({ text: session.text.slice(offset) });
		const more = event => this.openActions(session, event);
		content.addEventListener('click', event => {
			if (event.target.closest?.('.wujie-encrypted') !== area || area.ownerDocument.getSelection()?.isCollapsed === false) return;
			more(event);
		});
		content.addEventListener('keydown', event => { if (event.target === content && (event.key === 'Enter' || event.key === ' ')) more(event); });
		const moreButton = button(area, '⋯', more); moreButton.addClass('wujie-crypto-more'); moreButton.setAttribute?.('aria-label', '加密内容操作');
		area.oncontextmenu = more;
	}
	editSession(session) {
		if (session.locked) return;
		if ([...this.sessions].some(child => child.parentSession === session))
			return this.flushChildren(session).then(() => this.editSession(session)).catch(failure);
		session.lastUse = Date.now(); session.area.empty();
		session.area.oncontextmenu = null;
		session.area.classList?.toggle('is-editing', true);
		session.area.createDiv({ text: '安全编辑：按Markdown源码编辑，自动加密保存；图片和附件不随正文加密。' });
		const input = session.area.createEl('textarea', { cls: 'wujie-crypto-editor', attr: { 'aria-label': '编辑加密内容', maxlength: String(NOTE_LIMIT), spellcheck: 'false', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off' } });
		input.value = session.text; session.input = input;
		session.status = session.area.createDiv({ attr: { role: 'status', 'aria-live': 'polite' } });
		input.addEventListener('input', () => {
			if (session.locked) return;
			if (new TextEncoder().encode(input.value).length > NOTE_LIMIT) { input.value = session.text; session.status.setText(`超过${formatStorageSize(NOTE_LIMIT)}，已保留修改前的内容，请缩小范围。`); return; }
			session.text = input.value; session.version++; session.lastUse = Date.now();
			session.status.setText('正在加密保存…'); this.queueSave(session);
		});
		button(session.area, '完成', () => { void this.finishEditing(session); });
		button(session.area, '锁定', () => this.lock(session));
		input.focus();
	}
	async finishEditing(session) {
		await this.queueSave(session);
		if (!session.locked && session.saved === session.version) { session.input.value = ''; session.input = undefined; this.showSession(session); }
	}
	queueSave(session) {
		if (session.work) return session.work;
		if (session.saved === session.version) return Promise.resolve();
		const work = (async () => {
			while (session.saved < session.version) {
				const version = session.version, text = session.text;
				session.pendingBox = undefined;
				const nextBox = await updateLocked(session.box, session.key, text);
				const nextMarker = lockedMarker(nextBox);
				session.pendingBox = nextBox;
				// Journal contains ciphertext only, including when a concurrent edit prevents saving.
				await this.writeDraft(session, nextBox);
				try {
					session.writingMarker = nextMarker;
					const preserveTime = session.preserveTime === true;
					session.preserveTime = false;
					await this.replaceMarker(session, nextMarker, preserveTime);
					session.box = nextBox; session.marker = nextMarker; session.saved = version;
					session.failed = false; this.volatileDrafts.delete(session.box.id);
					session.pendingBox = undefined;
					session.writingMarker = undefined;
					await this.removeDraft(session.box.id);
					if (!session.locked) session.status?.setText('已加密保存');
				} catch {
					session.draft = nextBox;
					if (!session.locked) session.status?.setText('原笔记保存失败；已保留加密草稿。可通过“恢复加密草稿”找回。');
					else new Notice('原笔记保存失败；已保留加密草稿，请使用“恢复加密草稿”。');
					break;
				}
			}
		})().catch(() => {
			// Never announce durability when the encrypted journal itself failed.
			session.failed = true;
			if (session.pendingBox) this.volatileDrafts.set(session.box.id, session.pendingBox);
			if (!session.locked) session.status?.setText('保存失败，请保持此窗口并重试；尚未确认保存。');
			new Notice('加密内容尚未保存成功，请重试；未保存的最后修改可能丢失。');
		}).finally(() => {
			session.work = undefined;
			if (session.locked && !session.closing && (!session.failed || session.pendingBox)) { session.text = ''; session.key = undefined; }
			if (session.locked) this.refreshLockedSession(session);
			this.pendingWrites.delete(work);
		});
		session.work = work; this.pendingWrites.add(work);
		return work;
	}
	async replaceMarker(session, next, preserveTime, active = () => true) {
		if (session.parentSession) {
			const parent = session.parentSession;
			if (!active() || !parent.key) throw Error('外层笔记已锁定，请重新解锁。');
			const matches = lockedRanges(parent.text).filter(range => range.marker === session.marker);
			if (matches.length !== 1) throw Error('外层笔记已修改，请恢复加密草稿。');
			const [range] = matches;
			parent.text = parent.text.slice(0, range.from) + next + parent.text.slice(range.to); parent.version++;
			parent.preserveTime = preserveTime && parent.saved === parent.version - 1;
			await this.queueSave(parent);
			if (parent.saved !== parent.version) throw Error('外层笔记尚未保存，请恢复加密草稿。');
			return parent.text;
		}
		const file = this.app.vault.getAbstractFileByPath(session.path);
		if (!fileIsNote(file)) throw Error('笔记已移动或删除。');
		if (this.busyFiles.has(file)) throw Error('笔记正在转换，请重试。');
		const prior = this.locks.get(file) ?? Promise.resolve();
		const write = prior.catch(() => {}).then(async () => {
			if (!active()) throw Error('操作已取消。');
			const current = await this.app.vault.read(file);
			const ranges = lockedRanges(current).filter(range => range.marker === session.marker);
			if (ranges.length !== 1) throw Error('加密块已变更或重复，已保留双方内容，请重新打开。');
			const range = ranges[0];
			const nextText = current.slice(0, range.from) + next + current.slice(range.to);
			// An editor containing newer unsaved surrounding text must not be overwritten.
			for (const leaf of this.app.workspace.getLeavesOfType('markdown'))
				if (leaf.view?.file === file && leaf.view.editor?.getValue() !== current) throw Error('笔记有未保存的修改，请先保存后重试。');
			await replaceLocked(this.app.vault, file, current, nextText, preserveTime ? file.stat.mtime : undefined, active);
			return nextText;
		});
		this.locks.set(file, write);
		try { return await write; } finally { if (this.locks.get(file) === write) this.locks.delete(file); }
	}
	changePassword(session) {
		new PasswordWindow(this, '验证原密码', session.box, false, async (password, _hint, active) => {
			await this.flushChildren(session);
			await this.queueSave(session);
			if (session.saved !== session.version) throw Error('请先保存或恢复加密草稿。');
			await openLocked(session.box, password);
			if (!active()) return;
			// Keep only a temporary non-extractable wrapping operation, never a saved password.
			const oldPassword = password;
			new PasswordWindow(this, '设置新密码', session.box, true, async (nextPassword, hint, nextActive) => {
				const next = await rewrapLocked(session.box, oldPassword, nextPassword, hint);
				if (!nextActive()) return;
				await this.replaceMarker(session, lockedMarker(next), true, nextActive);
				session.box = next; session.marker = lockedMarker(next);
				this.lock(session);
			}).open();
		}).open();
	}
	permanent(session) {
		new PasswordWindow(this, '永久解密', session.box, false, async (password, _hint, active) => {
			await this.flushChildren(session);
			await this.queueSave(session);
			if (session.saved !== session.version) throw Error('请先保存或恢复加密草稿。');
			const { text } = await openLocked(session.box, password);
			if (!active()) return;
			const saved = await this.replaceMarker(session, text, true, active);
			if (!session.parentSession && !containsLockedText(saved)) {
				for (const state of Object.values(this.owner.data?.connections ?? {})) if (state.localEncryption) delete state.localEncryption[session.path];
				if (this.owner.data) await this.owner.saveData(this.owner.data);
			}
			this.clearSession(session);
			if (session.parentSession && !session.parentSession.locked) session.area.createSpan({ text });
			new Notice('已永久解密，原文现在作为普通文字保存。');
		}).open();
	}
	clearSession(session, retaining = false) {
		this.closeActions();
		session.locked = true;
		if (session.input) session.input.value = '';
		session.area.empty(); this.sessions.delete(session);
		if (!retaining && !session.work && !session.failed) { session.text = ''; session.key = undefined; }
	}
	refreshLockedSession(session) {
		const current = this.areas.get(session.area);
		if (session.area.isConnected && (current === session || current?.lockOwner === session)) {
			session.area.empty(); this.renderLock(session.area, session.path, session.marker, session.box, session.parentSession);
			this.areas.get(session.area).lockOwner = session;
		}
	}
	async flushChildren(session) {
		const children = [...this.sessions].filter(child => child.parentSession === session);
		await Promise.all(children.map(child => this.lock(child)));
		if (children.some(child => child.saved !== child.version)) throw Error('内层内容尚未保存，请先恢复加密草稿。');
	}
	lock(session) {
		if (session.locked) return session.lockWork;
		const children = [...this.sessions].filter(child => child.parentSession === session);
		session.closing = true;
		const childWork = children.map(child => this.lock(child));
		this.clearSession(session, true);
		this.renderLock(session.area, session.path, session.marker, session.box, session.parentSession);
		this.areas.get(session.area).lockOwner = session;
		const lockWork = Promise.all(childWork).then(() => this.queueSave(session)).finally(() => {
			session.closing = false;
			if (!session.failed || session.pendingBox) { session.text = ''; session.key = undefined; }
			this.pendingWrites.delete(lockWork);
			this.refreshLockedSession(session);
		});
		session.lockWork = lockWork; this.pendingWrites.add(lockWork);
		return lockWork;
	}
	lockAll() {
		this.closeActions();
		this.epoch++;
		for (const prompt of [...this.prompts]) prompt.close();
		for (const session of [...this.sessions]) this.lock(session);
	}
	sweep() {
		if (this.document?.hidden) { this.lockAll(); return; }
		for (const session of [...this.sessions]) {
			const open = this.app.workspace.getLeavesOfType('markdown').some(leaf => leaf.view?.file?.path === session.path);
			const idle = this.owner.data?.encryptionPreferences?.idleMinutes ?? 5;
			if (!session.area.isConnected || !open || idle > 0 && Date.now() - session.lastUse >= idle * 60_000) this.lock(session);
		}
	}
	async writeDraft(session, box) {
		const adapter = this.app.vault.adapter;
		if (!adapter || typeof adapter.write !== 'function') throw Error('无法保存加密草稿。');
		let parent = '';
		for (const part of this.recoveryDir.split('/')) {
			parent = parent ? parent + '/' + part : part;
			if (!await adapter.exists(parent)) await adapter.mkdir(parent);
		}
		await adapter.write(`${this.recoveryDir}/${box.id}.json`, JSON.stringify({ format: 1, source: session.path, box }));
	}
	async removeDraft(id) {
		if (!safeId(id)) return;
		const path = `${this.recoveryDir}/${id}.json`;
		if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
	}
	async recoverDrafts() {
		const adapter = this.app.vault.adapter;
		const files = adapter && await adapter.exists(this.recoveryDir) ? (await adapter.list(this.recoveryDir)).files : [];
		if (!files.length && !this.volatileDrafts.size) { new Notice('没有待恢复的加密草稿。'); return; }
		const modal = new Modal(this.app); modal.setTitle('恢复加密草稿');
		modal.contentEl.createEl('p', { text: '恢复为独立加密笔记，不覆盖原文件；使用原密码解锁。' });
		for (const [id, box] of this.volatileDrafts) button(modal.contentEl, '恢复本次会话的加密草稿', () => { void (async () => {
			const file = await this.app.vault.create(`恢复的加密笔记-${id}-${Date.now()}.md`, lockedMarker(box));
			this.volatileDrafts.delete(id); await this.app.workspace.getLeaf(false).openFile(file); modal.close();
		})().catch(failure); });
		for (const path of files) {
			if (!/^([a-f0-9]{32})\.json$/u.test(path.slice(this.recoveryDir.length + 1)) || !path.startsWith(this.recoveryDir + '/')) continue;
			const row = modal.contentEl.createDiv();
			button(row, '恢复一份加密草稿', () => { void (async () => {
				const raw = await adapter.read(path);
				if (raw.length > 5 * 1024 * 1024) throw Error('草稿格式不支持。');
				const entry = JSON.parse(raw), box = decodeBox(encodeBox(entry.box));
				if (entry.format !== 1) throw Error('草稿格式不支持。');
				const file = await this.app.vault.create(`恢复的加密笔记-${box.id}-${Date.now()}.md`, lockedMarker(box));
				await adapter.remove(path); await this.app.workspace.getLeaf(false).openFile(file); modal.close();
			})().catch(failure); });
		}
		modal.open();
	}
	settings() {
		const modal = new Modal(this.app); modal.setTitle('笔记加密设置');
		const row = modal.contentEl.createEl('label', { text: '闲置后自动锁定 ' });
		const select = row.createEl('select', { attr: { 'aria-label': '闲置后自动锁定' } });
		for (const [value, text] of [[1, '1分钟'], [5, '5分钟'], [15, '15分钟'], [0, '不按闲置时间锁定']]) select.createEl('option', { text, value: String(value) });
		select.value = String(this.owner.data?.encryptionPreferences?.idleMinutes ?? 5);
		modal.contentEl.createEl('p', { text: '关闭笔记、应用进入后台或退出笔记库仍会锁定。密码仅用于本次解锁，不写入设置。' });
		button(modal.contentEl, '保存', () => { void (async () => {
			const minutes = Number(select.value);
			if (![0, 1, 5, 15].includes(minutes)) throw Error('请选择有效的锁定时间。');
			this.owner.data.encryptionPreferences = { idleMinutes: minutes };
			await this.owner.saveData(this.owner.data); modal.close();
		})().catch(failure); });
		modal.open();
	}
	dispose() { this.lockAll(); this.stopped = true; }
}

class LockWidget extends WidgetType {
	constructor(manager, marker, box) { super(); Object.assign(this, { manager, marker, box }); }
	eq(other) { return other.marker === this.marker && other.manager === this.manager; }
	toDOM(view) {
		const area = view.dom.ownerDocument.createElement('span');
		const file = editorInfoField ? view.state.field(editorInfoField, false)?.file : undefined;
		this.manager.renderLock(area, file?.path, this.marker, this.box);
		return area;
	}
	updateDOM(area) {
		const current = this.manager.areas.get(area);
		if (current?.box?.id !== this.box?.id) return false;
		if (this.manager.sessions.has(current) && !current.locked) {
			if (current.marker === this.marker || current.writingMarker === this.marker) return true;
			this.manager.lock(current);
		}
		const owner = this.manager.areas.get(area)?.lockOwner;
		area.empty(); this.manager.renderLock(area, current.path, this.marker, this.box, current.parentSession);
		if (owner && (owner.marker === this.marker || owner.writingMarker === this.marker)) this.manager.areas.get(area).lockOwner = owner;
		return true;
	}
	ignoreEvent() { return true; }
	destroy(area) {
		const session = this.manager.areas.get(area);
		if (this.manager.sessions.has(session)) this.manager.lock(session);
	}
}

export function encryptionExtension(manager) {
	const decorate = state => Decoration.set(lockedRanges(state.doc.toString()).map(range => Decoration.replace({
		widget: new LockWidget(manager, range.marker, range.box),
	}).range(range.from, range.to)), true);
	const field = StateField.define({
		create: decorate,
		update: (value, transaction) => transaction.docChanged ? decorate(transaction.state) : value,
		provide: value => [EditorView.decorations.from(value), EditorView.atomicRanges.of(view => view.state.field(value))],
	});
	const protect = EditorState.transactionFilter.of(transaction => {
		if (!transaction.docChanged) return transaction;
		let partial = false;
		const ranges = lockedRanges(transaction.startState.doc.toString());
		transaction.changes.iterChangedRanges((from, to) => {
			if (ranges.some(range => from > range.from && from < range.to || to > range.from && to < range.to)) partial = true;
		});
		return partial ? [] : transaction;
	});
	const mobile = ViewPlugin.define(view => {
		let toolbar;
		const update = () => {
			if (!Platform.isMobile) return;
			const info = editorInfoField ? view.state.field(editorInfoField, false) : undefined;
			if (view.state.selection.main.empty || !info?.editor || !fileIsNote(info.file)) { toolbar?.remove(); toolbar = undefined; return; }
			if (toolbar) return;
			toolbar = view.dom.parentElement.createDiv({ cls: 'wujie-encryption-selection-tools' });
			const action = button(toolbar, '加密所选文本', () => { void manager.encryptSelection(info.editor, info.file).catch(failure); });
			action.addEventListener('pointerdown', event => event.preventDefault());
		};
		update();
		return { update, destroy() { toolbar?.remove(); } };
	});
	return [field, protect, mobile];
}

export function registerNoteEncryption(owner) {
	const manager = new NoteEncryption(owner); owner.noteEncryption = manager;
	owner.encryptWholeNote = () => manager.encryptNote().catch(failure);
	owner.encryptSelectedText = () => {
		const view = owner.app.workspace.getMostRecentLeaf?.()?.view;
		return manager.encryptSelection(view?.editor, view?.file).catch(failure);
	};
	owner.lockEncryptedNotes = () => manager.lockAll();
	owner.recoverEncryptedDrafts = () => manager.recoverDrafts().catch(failure);
	owner.noteEncryptionSettings = () => manager.settings();
	for (const [id, name, method] of [
		['encrypt-selected-text', '加密所选文本', 'encryptSelectedText'],
		['encrypt-whole-note', '加密整篇笔记', 'encryptWholeNote'],
		['lock-encrypted-notes', '立即锁定全部加密内容', 'lockEncryptedNotes'],
		['recover-encrypted-drafts', '恢复加密草稿', 'recoverEncryptedDrafts'],
		['note-encryption-settings', '笔记加密设置', 'noteEncryptionSettings'],
	]) owner.addCommand({ id, name, callback: () => owner[method]() });
	const workspace = owner.app.workspace;
	if (workspace.on) {
		owner.registerEvent(workspace.on('editor-menu', (menu, editor, info) => {
			if (!editor.getSelection() || !fileIsNote(info.file)) return;
			menu.addItem(item => item.setTitle('加密所选文本').setIcon('lock').onClick(() => { void manager.encryptSelection(editor, info.file).catch(failure); }));
		}));
		owner.registerEvent(workspace.on('file-menu', (menu, file) => {
			if (fileIsNote(file)) menu.addItem(item => item.setTitle('加密整篇笔记').setIcon('lock').onClick(() => { void manager.encryptNote(file).catch(failure); }));
		}));
		owner.registerEvent(workspace.on('layout-change', () => manager.sweep()));
	}
	if (owner.app.vault.on) for (const event of ['rename', 'delete']) owner.registerEvent(owner.app.vault.on(event, () => manager.lockAll()));
	manager.document = workspace.containerEl?.ownerDocument;
	if (manager.document && owner.registerDomEvent) {
		owner.registerDomEvent(manager.document, 'contextmenu', event => manager.readingMenu(event), true);
		owner.registerDomEvent(manager.document, 'visibilitychange', () => { if (manager.document.hidden) manager.lockAll(); });
		owner.registerDomEvent(manager.document.defaultView, 'pagehide', () => manager.lockAll());
	}
	owner.registerInterval(window.setInterval(() => manager.sweep(), 10_000));
	owner.registerEditorExtension?.(encryptionExtension(manager));
	owner.registerMarkdownCodeBlockProcessor?.('wujie-encrypted', (source, el, ctx) => {
		let box; try { box = decodeBox(source.trim()); } catch { /* Opaque damaged envelope. */ }
		const marker = box ? lockedMarker(box) : '';
		manager.renderLock(el, ctx.sourcePath, marker, box?.kind === 'note' ? box : undefined);
	});
	owner.registerMarkdownPostProcessor?.((el, ctx) => {
		const doc = el.ownerDocument;
		const walker = doc.createTreeWalker(el, 4);
		const nodes = []; while (walker.nextNode()) if (walker.currentNode.nodeValue.includes(TEXT_PREFIX)) nodes.push(walker.currentNode);
		for (const node of nodes) {
			const text = node.nodeValue, fragment = doc.createDocumentFragment(); let offset = 0;
			for (const range of lockedRanges(text)) {
				fragment.appendChild(doc.createTextNode(text.slice(offset, range.from)));
				const span = doc.createElement('span'); manager.renderLock(span, ctx.sourcePath, range.marker, range.box); fragment.appendChild(span); offset = range.to;
			}
			fragment.appendChild(doc.createTextNode(text.slice(offset))); node.replaceWith(fragment);
		}
	});
	return manager;
}
