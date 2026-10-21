import { t } from './i18n.js';
import { containsLockedText } from './note-crypto.js';
import { diff3Merge, diffComm } from 'node-diff3';
const baseIndexes = new WeakMap();
const baseEncoder = new TextEncoder();
const baseLimit = 4 * 1024 * 1024;

export function compareText(before, after) {
	if (before.length > 65536 || after.length > 65536) return t('msg_9c1cae6685');
	try {
		const a = new TextDecoder('utf8', { fatal: true }).decode(before),
			b = new TextDecoder('utf8', { fatal: true }).decode(after);
		if (a.includes('\0') || b.includes('\0')) return t('msg_4182d59f6c');
		if (a.split('\n').length > 2000 || b.split('\n').length > 2000) return t('msg_78cc22cfc3');
		return diffComm(a.split('\n'), b.split('\n'))
			.flatMap((block) =>
				block.common
					? block.common.map((line) => `  ${line}`)
					: [
							...block.buffer1.map((line) => `- ${line}`),
							...block.buffer2.map((line) => `+ ${line}`),
						],
			)
			.join('\n');
	} catch {
		return t('msg_1ce0ba5048');
	}
}

const text = new TextDecoder('utf-8', { fatal: true });
export function mergeNote(base, local, remote) {
	if (typeof base !== 'string' || local.length > 262144 || remote.length > 262144) return undefined;
	try {
		const a = text.decode(local),
			b = text.decode(remote);
		if (a.includes(String.fromCharCode(0)) || b.includes(String.fromCharCode(0)) ||
			[base, a, b].some(containsLockedText)) return undefined;
		const blocks = diff3Merge(a.split('\n'), base.split('\n'), b.split('\n'), {
			excludeFalseConflicts: true,
		});
		if (blocks.some((block) => Object.hasOwn(block, 'conflict'))) return undefined;
		return new TextEncoder().encode(blocks.flatMap((block) => block.ok).join('\n'));
	} catch {
		return undefined;
	}
}
export function rememberBase(state, id, contents) {
	const note = state.notes[id];
	if (!note?.path.toLowerCase().endsWith('.md')) return;
	if (contents.length > 262144) { delete note.base; delete note.baseAt; return; }
	if (state.localEncryption?.[note.path]) { delete note.base; delete note.baseAt; return; }
	let index = baseIndexes.get(state);
	if (!index || index.notes !== state.notes) {
		index = { notes: state.notes, entries: new Map(), bytes: 0 };
		for (const [key, entry] of Object.entries(state.notes).filter(([, entry]) => typeof entry.base === 'string').sort((a,b) => (a[1].baseAt ?? 0) - (b[1].baseAt ?? 0))) {
			const bytes = baseEncoder.encode(entry.base).length;
			index.entries.set(key, bytes); index.bytes += bytes;
		}
		baseIndexes.set(state, index);
	}
	try {
		const base = text.decode(contents);
		if (containsLockedText(base)) {
			state.localEncryption ??= {}; state.localEncryption[note.path] = true;
			delete note.base; delete note.baseAt; return;
		}
		if (base.includes(String.fromCharCode(0))) return;
		note.base = base;
		note.baseAt = Date.now();
	} catch {
		return;
	}
	index.bytes -= index.entries.get(id) ?? 0;
	index.entries.delete(id);
	const bytes = baseEncoder.encode(note.base).length;
	index.entries.set(id, bytes); index.bytes += bytes;
	while (index.bytes > baseLimit) {
		const [oldest, size] = index.entries.entries().next().value;
		index.entries.delete(oldest); index.bytes -= size;
		const entry = state.notes[oldest];
		if (entry) { delete entry.base; delete entry.baseAt; }
	}
}
