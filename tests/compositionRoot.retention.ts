import { expect, it } from 'vitest';
import { setImmediate } from 'node:timers/promises';
import { CompositionRoot } from '../src/lib/shared/boundary-provider/CompositionRoot.js';
import { TranslationManager } from '../src/lib/i18n/TranslationManager.js';
import { getTranslationManagerLifecycle } from '../src/lib/i18n/Internal.js';
import { RequestContext } from '../src/lib/shared/request-context/Internal.js';
import { runRequest } from '../src/lib/server/Context/Runtime.js';

it('module-level roots and exported t do not retain completed request state', async () => {
	const gc = globalThis.gc;
	if (!gc) throw new Error('Run with --expose-gc');
	const root = new CompositionRoot({ register: () => ({ service: () => ({ event: RequestContext.current().event }) }) });
	const translations = new TranslationManager({ messages: { en: async () => ({ title: 'Hello' }) }, initLang: 'en' });
	const { t } = translations;
	const refs: WeakRef<object>[] = [];
	async function requests() {
		for (let index = 0; index < 500; index++) {
			await runRequest({ request: new Request('http://localhost/'), cookies: { get: () => undefined } } as never, async () => {
				await getTranslationManagerLifecycle(translations).preloadTranslation();
				expect(t('title')).toBe('Hello');
				const context = RequestContext.current();
				const container = root.resolveContainer();
				refs.push(new WeakRef(context), new WeakRef(context.event), new WeakRef(container), new WeakRef(container.service));
			});
		}
	}
	await requests();
	let retained = refs.length;
	for (let attempt = 0; attempt < 30; attempt++) {
		await setImmediate();
		gc();
		await setImmediate();
		retained = refs.filter((ref) => ref.deref() !== undefined).length;
		if (!retained) break;
	}
	console.info(`CompositionRoot + TranslationManager: ${refs.length - retained}/${refs.length} request objects collected`);
	expect(retained).toBe(0);
	// Keep module-level metadata and t alive throughout the probe.
	expect(typeof root.resolveContainer).toBe('function');
	expect(typeof t).toBe('function');
}, 15000);
