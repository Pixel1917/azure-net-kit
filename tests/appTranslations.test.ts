import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/lib/shared/app/App.js';
import { createTranslations } from '../src/lib/i18n/index.js';
import { runRequest } from '../src/lib/server/Context/Runtime.js';
import { RequestContext } from '../src/lib/shared/request-context/Internal.js';
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));
vi.mock('svelte', async (original) => ({ ...(await original<object>()), hydratable: (_: string, fn: () => unknown) => fn() }));
const event = (language = 'ru') =>
	({ request: new Request('http://localhost/', { headers: { 'accept-language': language } }), cookies: { get: () => undefined } }) as never;
const messages = { en: async () => ({ title: 'English' }), ru: async () => ({ title: 'Russian' }) };
describe('useTranslations integration', () => {
	it('preloads even without hooks and serializes only locale', async () => {
		const manager = createTranslations({ messages, initLang: 'en', initLangFromAcceptLanguage: true });
		const { register } = createApp((app) => app.useTranslations(manager));
		const request = event();
		await runRequest(request, async () => {
			const response = await register.handle({
				event: request,
				resolve: async (_, options) => {
					register();
					register();
					expect(manager().t('title')).toBe('Russian');
					expect(RequestContext.current().state).toEqual({ currLocale: 'ru', i18n: { default: { locale: 'ru' } } });
					return new Response(await options?.transformPageChunk?.({ html: '<html lang="%lang%"><head></head></html>', done: true }));
				}
			});
			expect(await response.text()).toContain('lang="ru" data-azure-net-locale="ru"');
		});
	});
	it('prepares translations before server/boot and preserves resolve options', async () => {
		const manager = createTranslations({ messages, initLang: 'en', initLangFromAcceptLanguage: true });
		const order: string[] = [];
		const { register } = createApp((app) =>
			app
				.useTranslations(manager)
				.useServer(({ event, resolve }) => {
					order.push(manager().t('title'));
					order.push('server');
					return resolve(event, { preload: () => false, transformPageChunk: () => undefined });
				})
				.useBoot(({ state }) => {
					expect(state.currLocale).toBe('ru');
					expect(manager().t('title')).toBe('Russian');
					order.push('boot');
				})
		);
		const request = event();
		await runRequest(request, () =>
			register.handle({
				event: request,
				resolve: async (_, options) => {
					register();
					expect(options?.preload?.({ type: 'js', path: '/test.js' })).toBe(false);
					const html = await options?.transformPageChunk?.({ html: '<html>original</html>', done: true });
					expect(html).toContain('original');
					expect(html).toContain('data-azure-net-locale="ru"');
					return new Response(html);
				}
			})
		);
		expect(order).toEqual(['Russian', 'server', 'boot']);
	});
	it('does nothing unless opted in and rejects duplicate registration', async () => {
		const load = vi.fn(messages.en);
		const manager = createTranslations({ messages: { en: load }, initLang: 'en' });
		const { register } = createApp((app) => app);
		const request = event();
		await runRequest(request, () => register.handle({ event: request, resolve: () => new Response('ok') } as never));
		expect(load).not.toHaveBeenCalled();
		expect(() =>
			createApp((app) => {
				app.useTranslations(manager);
				app.useTranslations(manager);
			})
		).toThrow('only once');
	});
	it('isolates locales across concurrent app handles', async () => {
		const manager = createTranslations({ messages, initLang: 'en', initLangFromAcceptLanguage: true });
		const { register } = createApp((app) => app.useTranslations(manager));
		await Promise.all(
			Array.from({ length: 40 }, (_, index) => {
				const locale = index % 2 ? 'ru' : 'en';
				const request = event(locale);
				return runRequest(request, () =>
					register.handle({
						event: request,
						resolve: async () => {
							await new Promise((r) => setTimeout(r, index % 3));
							register();
							expect(manager().locale).toBe(locale);
							return new Response('ok');
						}
					} as never)
				);
			})
		);
	});
});
