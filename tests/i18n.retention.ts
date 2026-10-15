import { getTranslationLifecycle } from '../src/lib/i18n/Internal.js';
import { expect, it } from 'vitest';
import { setImmediate } from 'node:timers/promises';
import { createTranslations } from '../src/lib/i18n/index.js';
import { RequestContext } from '../src/lib/shared/request-context/Internal.js';
import { runRequest } from '../src/lib/server/Context/Runtime.js';

it('releases completed SSR requests, managers and dictionaries', async () => {
	const gc = globalThis.gc;
	if (!gc) throw new Error('Run with vitest.retention.config.ts (--expose-gc)');
	const use = createTranslations({ messages: { en: async () => ({ title: 'Memory probe' }) }, initLang: 'en' });
	const refs: WeakRef<object>[] = [];
	async function requests() {
		for (let i = 0; i < 500; i++) {
			await runRequest({ request: new Request('http://localhost/'), cookies: { get: () => undefined } } as never, async () => {
				const manager = use();
				await getTranslationLifecycle(manager).preloadTranslation();
				const context = RequestContext.current();
				refs.push(new WeakRef(context), new WeakRef(context.event), new WeakRef(manager), new WeakRef(context.state.i18n!.default));
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
		if (retained === 0) break;
	}
	console.info(`SSR retention probe: ${refs.length - retained}/${refs.length} collected after 500 requests`);
	expect(retained).toBe(0);
}, 15000);
