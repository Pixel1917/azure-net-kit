import { getTranslationLifecycle } from '../src/lib/i18n/Internal.js';
import { describe, expect, it, vi } from 'vitest';
import { createTranslations } from '../src/lib/i18n/index.js';
import { RequestContext } from '../src/lib/shared/request-context/Internal.js';
import { runRequest } from '../src/lib/server/Context/Runtime.js';

const event = (language = 'en', cookie?: string) =>
	({
		request: new Request('http://localhost/', { headers: { 'accept-language': language } }),
		cookies: { get: () => cookie }
	}) as never;
const messages = {
	en: async () => ({ title: 'English', nested: { hello: 'Hello {{name}}' }, count: '{{count | plural:item,items,items}}' }),
	ru: async () => ({ title: 'Русский' })
};
describe('kit i18n SSR', () => {
	it('does not share mutable dictionary objects through request state', async () => {
		const dictionary = { nested: { title: 'original' } };
		const use = createTranslations({ messages: { en: async () => dictionary }, initLang: 'en' });
		await runRequest(event(), async () => {
			await getTranslationLifecycle(use()).preloadTranslation();
			expect(RequestContext.current().state.i18n!.default).toEqual({ locale: 'en' });
			expect(use()).not.toHaveProperty('preloadTranslation');
			expect(use()).not.toHaveProperty('initializeClient');
			expect(use()).not.toHaveProperty('syncFromState');
		});
		expect(dictionary.nested.title).toBe('original');
		await runRequest(event(), async () => {
			await getTranslationLifecycle(use()).preloadTranslation();
			expect(use().t('nested.title')).toBe('original');
		});
	});
	it('is lazy and requires a request for resolving its singleton', () => {
		const use = createTranslations({ messages, initLang: 'en' });
		expect(() => use()).toThrow('No active RequestContext');
	});
	it('isolates 60 concurrent requests and prepares a serializable boot snapshot', async () => {
		const use = createTranslations({ messages, initLang: 'en', initLangFromAcceptLanguage: true });
		await Promise.all(
			Array.from({ length: 60 }, (_, i) =>
				runRequest(event(i % 2 ? 'ru' : 'en'), async () => {
					const manager = use();
					await getTranslationLifecycle(manager).preloadTranslation();
					await new Promise((resolve) => setTimeout(resolve, i % 3));
					expect(use()).toBe(manager);
					expect(manager.locale).toBe(i % 2 ? 'ru' : 'en');
					expect(manager.t('title')).toBe(i % 2 ? 'Русский' : 'English');
					expect(RequestContext.current().state.currLocale).toBe(manager.locale);
					expect(RequestContext.current().state.i18n?.default.locale).toBe(manager.locale);
				})
			)
		);
	});
	it('honors valid cookie, quality ordering, region fallback and async resolver', () =>
		runRequest(event('en;q=0.1, ru-RU;q=0.9', 'en'), async () => {
			const use = createTranslations({ messages, initLang: 'en', cookieName: 'lang', initLangFromAcceptLanguage: true });
			const manager = use();
			await getTranslationLifecycle(manager).preloadTranslation();
			expect(manager.locale).toBe('en');

			const other = createTranslations({ messages, initLang: 'en', initLangFromAcceptLanguage: true })();
			await getTranslationLifecycle(other).preloadTranslation();
			expect(other.locale).toBe('ru');
		}));
	it('deduplicates loads and permits retry after a synchronous loader failure', () =>
		runRequest(event(), async () => {
			let attempts = 0;
			const use = createTranslations({
				messages: {
					en: () => {
						if (++attempts === 1) throw Error('load');
						return Promise.resolve({ title: 'OK' });
					}
				},
				initLang: 'en'
			});
			await expect(getTranslationLifecycle(use()).preloadTranslation()).rejects.toThrow('load');
			await Promise.all([getTranslationLifecycle(use()).preloadTranslation(), getTranslationLifecycle(use()).preloadTranslation()]);
			expect(attempts).toBe(2);
			expect(use().t('title')).toBe('OK');
		}));
	it('keeps prefixed managers independent in the same boot payload', () =>
		runRequest(event(), async () => {
			const one = createTranslations({ messages, initLang: 'en', prefix: 'one' })();
			const two = createTranslations({ messages, initLang: 'ru', prefix: 'two' })();
			await getTranslationLifecycle(one).preloadTranslation();
			await getTranslationLifecycle(two).preloadTranslation();
			expect(RequestContext.current().state.i18n?.one.locale).toBe('en');
			expect(RequestContext.current().state.i18n?.two.locale).toBe('ru');
			getTranslationLifecycle(one).syncFromState(RequestContext.current().state);
			expect(one.locale).toBe('en');
		}));
	it('translates variables, missing keys, own properties and plural forms', () =>
		runRequest(event(), async () => {
			const manager = createTranslations({ messages, initLang: 'en' })();
			await getTranslationLifecycle(manager).preloadTranslation();
			expect(manager.t({ key: 'nested.hello', vars: { name: 'Sam' } })).toBe('Hello Sam');
			expect(manager.t('count', { count: 2 })).toBe('items');
			expect(manager.t('toString')).toBe('toString');
			expect(manager.t('missing')).toBe('missing');
			expect(manager.t()).toBe('');
			expect(manager.applyHtmlLocaleAttr('%lang% %lang%')).toBe('en en');
		}));
	it('rejects browser-only methods on SSR', () =>
		runRequest(event(), async () => {
			const manager = createTranslations({ messages, initLang: 'en' })();
			await expect(manager.switchLocale('ru')).rejects.toThrow('client-only');
			expect(() => manager.subscribeLocaleChangeEvent(vi.fn())).toThrow('client-only');
		}));
});
