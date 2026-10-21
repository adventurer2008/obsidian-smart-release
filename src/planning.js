import { fingerprint, inspectNote, safeNotePath } from './codec.js';
import { renamedFrom } from './synchronizer.js';

export function planChanged() {
	return Object.assign(new Error('Synchronization plan changed'), { code: 'PLAN_CHANGED', reviewRequired: true });
}
// Read-only: manifests only; no content segments, writes, commits or cursor saves.
export async function synchronizationPlan(engine, context = {}) {
	const folders = new Set((await engine.host.listFolders?.()) ?? []);
	const paths = [...(await engine.host.list()), ...folders].sort();
	const local = [];
	for (const raw of paths) {
		const path = safeNotePath(raw);
		if (engine.excluded(path)) continue;
		const file = folders.has(path)
			? { digest: await fingerprint(new Uint8Array()), size: 0 }
			: await engine.localFile(path, true);
		if (file !== null)
			local.push({
				path,
				digest: file.digest,
				bytes: file.size,
				kind: folders.has(path) ? 'folder' : 'file',
			});
	}
	const byPath = new Map(local.map((row) => [row.path, row]));
	const knownByPath = new Map(
		Object.entries(engine.state.notes)
			.filter(([, row]) => !row.removed)
			.map((entry) => [entry[1].path, entry]),
	);
	const latest = new Map();
	let cursor = engine.state.cursor;
	if (
		engine.direction !== 'send' &&
		engine.direction !== 'paused' &&
		engine.remoteMode !== 'send' &&
		engine.remoteMode !== 'paused'
	)
		for (;;) {
			const batch = await engine.api.feed(cursor);
			if (
				!Array.isArray(batch.entries) ||
				typeof batch.more !== 'boolean' ||
				(batch.more && !batch.entries.length)
			)
				throw Error('Invalid plan feed');
			for (const entry of batch.entries) {
				if (
					!Number.isSafeInteger(entry.sequence) ||
					entry.sequence <= cursor ||
					!/^[a-f0-9]{64}$/.test(entry.note) ||
					!/^[a-f0-9]{64}$/.test(entry.manifest) ||
					typeof entry.removed !== 'boolean'
				)
					throw Error('Invalid plan entry');
				cursor = entry.sequence;
				latest.set(entry.note, entry);
			}
			if (!batch.more) break;
		}
	const operations = [],
		cloud = [];
	for (const entry of latest.values()) {
		const known = engine.state.notes[entry.note];
		const deferred =
			known &&
			known.revision === entry.sequence &&
			!known.downloaded &&
			!known.removed &&
			!entry.removed;
		if ((known?.revision ?? 0) >= entry.sequence && !deferred) continue;
		const info = await inspectNote(
			engine.keys,
			engine.api.workspace,
			entry.note,
			entry.manifest,
			(address) => engine.api.load(address),
		);
		if (deferred && (info.kind === 'folder' || info.bytes > engine.attachmentLimit)) continue;
		cloud.push([entry.note, entry.sequence, entry.manifest, entry.removed]);
		if (engine.excluded(info.path)) continue;
		const prior = engine.state.notes[entry.note];
		const current = byPath.get(info.path) ?? (prior ? byPath.get(prior.path) : undefined);
		const dirty = current && current.digest !== prior?.digest && current.digest !== info.digest;
		let action = entry.removed
			? 'deleteLocal'
			: prior && prior.path !== info.path
				? 'moveLocal'
				: current
					? 'updateLocal'
					: 'download';
		if (dirty) action = 'conflict';
		if (
			engine.direction === 'update' &&
			(entry.removed || !current || info.kind === 'folder' || prior?.path !== info.path)
		)
			action = 'skip';
		if (!entry.removed && !dirty && current?.digest === info.digest && prior?.path === info.path)
			action = 'metadata';
		operations.push({
			action,
			path: info.path,
			from: prior?.path,
			note: entry.note,
			bytes: info.bytes,
			kind: info.kind,
			deferred:
				info.kind === 'file' &&
				!info.path.toLowerCase().endsWith('.md') &&
				info.bytes > engine.attachmentLimit,
		});
	}
	if (
		!['receive', 'paused'].includes(engine.direction) &&
		!['receive', 'paused'].includes(engine.remoteMode)
	) {
		for (const file of local) {
			const renamed = knownByPath.get(renamedFrom(file.path, engine.renames));
			const prior =
				knownByPath.get(file.path) ??
				(renamed && !byPath.has(renamed[1].path) ? renamed : undefined);
			if (engine.direction === 'update' && !prior) continue;
			if (!prior || prior[1].digest !== file.digest || prior[1].path !== file.path)
				operations.push({
					action: prior && prior[1].path !== file.path ? 'moveCloud' : 'upload',
					path: file.path,
					from: prior?.[1].path,
					kind: file.kind,
					bytes: file.bytes,
				});
		}
		if (engine.direction !== 'update')
			for (const [note, row] of Object.entries(engine.state.notes))
				if (
					!row.removed &&
					row.downloaded &&
					!engine.excluded(row.path) &&
					!byPath.has(row.path) &&
					!operations.some((op) => op.from === row.path || op.note === note)
				)
					operations.push({ action: 'deleteCloud', path: row.path, note });
	}
	const binding = {
		workspace: engine.api.workspace,
		cursor: engine.state.cursor,
		ceiling: cursor,
		local,
		cloud,
		context,
		state: engine.state.notes,
		direction: engine.direction,
		remoteMode: engine.remoteMode,
		attachmentLimit: engine.attachmentLimit,
		ignored: engine.ignored,
		renames: engine.renames,
	};
	return {
		token: await fingerprint(new TextEncoder().encode(JSON.stringify(binding))),
		direction: engine.direction,
		ceiling: cursor,
		operations,
		created: Date.now(),
	};
}

export function diagnosticReport({ journal, scope, version, platform, counts }) {
	return {
		format: 'smart-sync-diagnostic-1',
		version,
		platform: platform === 'mobile' ? 'mobile' : 'desktop',
		generatedAt: new Date().toISOString(),
		counts: {
			notes: Number.isSafeInteger(counts?.notes) ? counts.notes : 0,
			conflicts: Number.isSafeInteger(counts?.conflicts) ? counts.conflicts : 0,
		},
		tasks: journal
			.select(scope)
			.slice(-200)
			.map(
				({ id, note, direction, status, started, finished, bytes, total, failure, version, workMilliseconds, checkpointMilliseconds }) => ({
					id,
					note,
					direction,
					status,
					started,
					finished,
					bytes,
					total,
					failure,
					version,
					workMilliseconds,
					checkpointMilliseconds,
				}),
			),
	};
}
