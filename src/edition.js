/* global __SMART_SYNC_EDITION__ -- Injected by the explicit regional build; absent in source-based local tests. */
// The fallback is only for existing source-based synthetic tests and local builds.
// Explicit distribution builds always inject an edition, including an unset origin.
export const edition = typeof __SMART_SYNC_EDITION__ === 'undefined'
	? Object.freeze({ edition: 'cn', id: 'wujie-sync', name: '无界同步', locale: 'zh-CN', development: true, serviceOrigin: 'http://127.0.0.1:14809' })
	: Object.freeze(__SMART_SYNC_EDITION__);

export function assertEditionOrigin(origin) {
	if (edition.development) return;
	if (!edition.serviceOrigin) throw Object.assign(new Error('Service is not configured for this edition'), { code: 'EDITION_UNCONFIGURED' });
	const staging = edition.edition === 'cn' && edition.stagingOrigin === 'http://127.0.0.1:24819' && origin === edition.stagingOrigin;
	if (origin !== edition.serviceOrigin && !staging)
		throw Object.assign(new Error('Connection belongs to another service'), { code: 'EDITION_SERVICE_MISMATCH' });
}

export const logViewType = `${edition.id}-log`;
