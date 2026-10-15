import { createApp } from '../src/lib/shared/app/App.js';
import { getTranslationLifecycle } from '../src/lib/i18n/Internal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createTranslations } from '../src/lib/i18n/index.js';
import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
import { watchTranslations } from './fixtures/TranslationObserver.svelte.js';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));
vi.mock('svelte', async (original) => ({ ...(await original<object>()), hydratable: (_: string, fn: () => unknown) => fn() }));
const cookieSet = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/external/tools/index.js', async (importOriginal) => ({
	...(await importOriginal<object>()),
	BROWSER: true,
	Cookies: { set: cookieSet, get: () => undefined }
}));
const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
};
beforeEach(() => {
	document.documentElement.removeAttribute('data-azure-net-locale');
});
describe('kit i18n client', () => {
	it('loads before boot without context access and keeps t reactive', async () => {
		initializeRequestContext(() => {
			throw Error('Server access');
		});
		const load = vi.fn(async () => ({ title: 'English' }));
		const use = createTranslations({ messages: { en: load, ru: async () => ({ title: 'Русский' }) }, initLang: 'en' });
		const manager = use();
		document.documentElement.setAttribute('data-azure-net-locale', 'en');
		await getTranslationLifecycle(manager).initializeClient();
		getTranslationLifecycle(manager).syncFromState({ currLocale: 'en', i18n: { default: { locale: 'en' } } });
		expect(manager.t('title')).toBe('English');
		expect(use()).toBe(manager);
		const seen: string[] = [];
		const dispose = watchTranslations(manager, (value) => seen.push(value));
		try {
			flushSync();
			await getTranslationLifecycle(manager).initializeClient();
			expect(load).toHaveBeenCalledOnce();
			await manager.switchLocale('ru');
			flushSync();
			expect(manager.locale).toBe('ru');
			expect(seen).toEqual(['en:English', 'ru:Русский']);
			getTranslationLifecycle(manager).syncFromState({ currLocale: 'en', i18n: { default: { locale: 'en' } } });
			expect(manager.locale).toBe('ru');
		} finally {
			dispose();
		}
	});
	it('initializes CSR, reacts to loading the same locale and shares pending imports', async () => {
		let loads = 0;
		const pending = deferred<{ title: string }>();
		const manager = createTranslations({
			messages: {
				en: () => {
					loads++;
					return pending.promise;
				}
			},
			initLang: 'en'
		})();
		getTranslationLifecycle(manager).syncFromState({});
		const seen: string[] = [];
		const dispose = watchTranslations(manager, (v) => seen.push(v));
		try {
			flushSync();
			const a = getTranslationLifecycle(manager).initializeClient(),
				b = getTranslationLifecycle(manager).initializeClient();
			pending.resolve({ title: 'Loaded' });
			await Promise.all([a, b]);
			flushSync();
			expect(loads).toBe(1);
			expect(seen).toEqual(['en:title', 'en:Loaded']);
		} finally {
			dispose();
		}
	});
	it('last locale change wins, not the slowest request', async () => {
		const ru = deferred<{ title: string }>();
		const en = deferred<{ title: string }>();
		const manager = createTranslations({ messages: { en: () => en.promise, ru: () => ru.promise }, initLang: 'en' })();
		const a = manager.switchLocale('ru'),
			b = manager.switchLocale('en');
		en.resolve({ title: 'English' });
		await b;
		ru.resolve({ title: 'Русский' });
		await a;
		expect(manager.locale).toBe('en');
		expect(manager.t('title')).toBe('English');
	});
	it('boot beats an older client initialization', async () => {
		const en = deferred<{ title: string }>();
		const manager = createTranslations({ messages: { en: () => en.promise, ru: async () => ({ title: 'R' }) }, initLang: 'en' })();
		const pending = getTranslationLifecycle(manager).initializeClient();
		getTranslationLifecycle(manager).syncFromState({ currLocale: 'ru', i18n: { default: { locale: 'ru' } } });
		en.resolve({ title: 'Stale' });
		await pending;
		expect(manager.locale).toBe('ru');
		expect(manager.t('title')).toBe('title');
	});
	it('can retry failed initialization and rejects invalid locale', async () => {
		let n = 0;
		const manager = createTranslations({
			messages: {
				en: async () => {
					if (!n++) throw Error('failed');
					return { title: 'ok' };
				}
			},
			initLang: 'en'
		})();
		await expect(getTranslationLifecycle(manager).initializeClient()).rejects.toThrow('failed');
		await getTranslationLifecycle(manager).initializeClient();
		await expect(manager.switchLocale('missing' as 'en')).rejects.toThrow('not present');
		await expect(getTranslationLifecycle(manager).preloadTranslation()).rejects.toThrow('server-only');
	});
	it('writes cookie, updates html lang and unsubscribes listeners', async () => {
		const manager = createTranslations({
			messages: { en: async () => ({ title: 'E' }), ru: async () => ({ title: 'R' }) },
			initLang: 'en',
			cookieName: 'lang'
		})();
		const listener = vi.fn();
		const stop = manager.subscribeLocaleChangeEvent(listener);
		await manager.switchLocale('ru');
		expect(cookieSet).toHaveBeenCalledWith('lang', 'ru', { path: '/', sameSite: 'Lax' });
		expect(document.documentElement.lang).toBe('ru');
		expect(listener).toHaveBeenCalledOnce();
		stop();
		await manager.switchLocale('en');
		expect(listener).toHaveBeenCalledOnce();
	});
});

describe('automatic client translation lifecycle', () => {
	it('awaits the SSR locale before user init, then keeps it through boot and repeated register', async () => {
		document.documentElement.setAttribute('data-azure-net-locale', 'ru');
		const loadEn = vi.fn(async () => ({ title: 'English' }));
		const loadRu = vi.fn(async () => ({ title: 'Russian' }));
		const manager = createTranslations({ messages: { en: loadEn, ru: loadRu }, initLang: 'en' });
		const order: string[] = [];
		const { register } = createApp((app) =>
			app
				.useTranslations(manager)
				.useClientInit(() => {
					order.push(manager().t('title'));
				})
				.useBoot(() => {
					order.push(manager().locale);
				})
				.useClient(() => {
					order.push('client');
				})
		);
		await register.clientInit();
		expect(order).toEqual(['Russian']);
		register();
		register();
		expect(order).toEqual(['Russian', 'ru', 'client']);
		expect(loadRu).toHaveBeenCalledOnce();
		expect(loadEn).not.toHaveBeenCalled();
		await manager().switchLocale('en');
		register();
		expect(manager().locale).toBe('en');
	});
	it('initializes CSR without user callbacks', async () => {
		const load = vi.fn(async () => ({ title: 'CSR' }));
		const manager = createTranslations({ messages: { en: load }, initLang: 'en' });
		const { register } = createApp((app) => app.useTranslations(manager));
		await register.clientInit();
		register();
		expect(manager().t('title')).toBe('CSR');
		expect(load).toHaveBeenCalledOnce();
	});
});

it('shares in-flight app initialization and retries failed dictionary loads before user code', async () => {
	const ready = deferred<{ title: string }>();
	let attempts = 0;
	const manager = createTranslations({
		messages: {
			en: () => {
				if (++attempts === 1) return Promise.reject(new Error('offline'));
				return ready.promise;
			}
		},
		initLang: 'en'
	});
	const userInit = vi.fn();
	const { register } = createApp((app) => app.useTranslations(manager).useClientInit(userInit));
	await expect(register.clientInit()).rejects.toThrow('offline');
	expect(userInit).not.toHaveBeenCalled();
	const first = register.clientInit();
	const second = register.clientInit();
	expect(first).toBe(second);
	ready.resolve({ title: 'Ready' });
	await second;
	expect(userInit).toHaveBeenCalledOnce();
	expect(manager().t('title')).toBe('Ready');
});
