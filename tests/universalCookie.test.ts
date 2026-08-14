import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@azure-net/edges/context';
import { edgesHandleRaw } from '@azure-net/edges/server';
import { UniversalCookie, type CookieOptions } from '../src/lib/shared/cookie/UniversalCookie.js';

type CookieRecord = { name: string; value: string };

const createCookieJar = (initial: Record<string, string> = {}) => {
	const values = new Map(Object.entries(initial));
	const set = vi.fn((name: string, value: string) => values.set(name, value));

	return {
		values,
		set,
		get: vi.fn((name: string) => values.get(name)),
		getAll: vi.fn((): CookieRecord[] => Array.from(values, ([name, value]) => ({ name, value })))
	};
};

describe('UniversalCookie on the server', () => {
	let cookies: ReturnType<typeof createCookieJar>;

	beforeEach(() => {
		cookies = createCookieJar();
		RequestContext.init(
			() =>
				({
					event: { cookies },
					data: {}
				}) as never
		);
	});

	it('stores raw values and lets SvelteKit perform cookie encoding once', () => {
		UniversalCookie.set('message', 'hello world / 100%', { sameSite: 'Lax' });

		expect(cookies.set).toHaveBeenCalledWith(
			'message',
			'hello world / 100%',
			expect.objectContaining({ path: '/', httpOnly: false, sameSite: 'lax' })
		);
		expect(UniversalCookie.get('message')).toBe('hello world / 100%');
	});

	it('round-trips JSON values with the established automatic parsing behavior', () => {
		UniversalCookie.set('profile', { id: 7, active: true });
		UniversalCookie.set('literal', 'true');

		expect(UniversalCookie.get('profile')).toEqual({ id: 7, active: true });
		expect(UniversalCookie.get('literal')).toBe(true);
		expect(UniversalCookie.getAll()).toEqual({ profile: { id: 7, active: true }, literal: true });
	});

	it('reads legacy server values that were encoded before SvelteKit encoded them again', () => {
		cookies = createCookieJar({
			legacyJson: encodeURIComponent(JSON.stringify({ id: 1 })),
			legacyText: encodeURIComponent('hello world')
		});
		RequestContext.init(() => ({ event: { cookies }, data: {} }) as never);

		expect(UniversalCookie.get('legacyJson')).toEqual({ id: 1 });
		expect(UniversalCookie.get('legacyText')).toBe('hello world');
		expect(UniversalCookie.getAll()).toEqual({ legacyJson: { id: 1 }, legacyText: 'hello world' });
	});

	it('supports expiration in days and forwards cookie options', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		const options: CookieOptions = { expires: 2, secure: true, httpOnly: true, sameSite: 'Strict', maxAge: 60 };

		UniversalCookie.set('token', 'secret', options);

		expect(cookies.set).toHaveBeenCalledWith(
			'token',
			'secret',
			expect.objectContaining({
				expires: new Date('2026-01-03T00:00:00.000Z'),
				secure: true,
				httpOnly: true,
				sameSite: 'strict',
				maxAge: 60
			})
		);
		vi.useRealTimers();
	});

	it('supports has, delete, clear and credentials', () => {
		UniversalCookie.set('first', 'one');
		UniversalCookie.set('second', { two: 2 });

		expect(UniversalCookie.has('first')).toBe(true);
		expect(UniversalCookie.has('missing')).toBe(false);
		expect(UniversalCookie.toCredentials()).toBe('first=one; second=%7B%22two%22%3A2%7D');

		UniversalCookie.delete('first');
		expect(cookies.set).toHaveBeenLastCalledWith('first', '', expect.objectContaining({ expires: new Date(0), maxAge: 0, path: '/' }));

		UniversalCookie.clear({ path: '/scope' });
		expect(cookies.set).toHaveBeenCalledWith('second', '', expect.objectContaining({ path: '/scope', maxAge: 0 }));
	});

	it('does not throw for a malformed legacy escape sequence', () => {
		cookies = createCookieJar({ malformed: '100% invalid' });
		RequestContext.init(() => ({ event: { cookies }, data: {} }) as never);

		expect(UniversalCookie.get('malformed')).toBe('100% invalid');
	});

	it('rejects values JSON.stringify cannot serialize', () => {
		expect(() => UniversalCookie.set('invalid', undefined)).toThrow('Cookie value is not JSON-serializable');
	});

	it('creates an instance with reusable defaults and optional per-call overrides', () => {
		const defaults: CookieOptions = {
			domain: 'example.com',
			path: '/app',
			secure: true,
			httpOnly: true,
			sameSite: 'Strict'
		};
		const instance = UniversalCookie.createInstance(defaults);
		defaults.path = '/mutated-after-creation';

		instance.set('first', 'value');
		instance.set('second', 'value', { path: '/custom', maxAge: 60 });

		expect(cookies.set).toHaveBeenNthCalledWith(
			1,
			'first',
			'value',
			expect.objectContaining({ domain: 'example.com', path: '/app', secure: true, httpOnly: true, sameSite: 'strict' })
		);
		expect(cookies.set).toHaveBeenNthCalledWith(
			2,
			'second',
			'value',
			expect.objectContaining({ domain: 'example.com', path: '/custom', secure: true, maxAge: 60 })
		);
	});

	it('creates a typed named instance without repeating its name or defaults', () => {
		const cookiesApi = UniversalCookie.createInstance({ domain: 'example.com', path: '/account', secure: true });
		const session = cookiesApi.createNamedInstance<{ userId: number }>('session');

		session.set({ userId: 7 });

		expect(session.name).toBe('session');
		expect(session.get()).toEqual({ userId: 7 });
		expect(session.has()).toBe(true);
		expect(cookies.set).toHaveBeenLastCalledWith(
			'session',
			'{"userId":7}',
			expect.objectContaining({ domain: 'example.com', path: '/account', secure: true })
		);

		session.clear();
		expect(cookies.set).toHaveBeenLastCalledWith(
			'session',
			'',
			expect.objectContaining({ domain: 'example.com', path: '/account', expires: new Date(0), maxAge: 0 })
		);
	});

	it('supports directly creating a named instance', () => {
		const theme = UniversalCookie.createNamedInstance<'light' | 'dark'>('theme', { path: '/settings', sameSite: 'Lax' });

		theme.set('dark');

		expect(theme.get()).toBe('dark');
		expect(cookies.set).toHaveBeenLastCalledWith('theme', 'dark', expect.objectContaining({ path: '/settings', sameSite: 'lax' }));
	});

	it('rejects an empty named cookie', () => {
		expect(() => UniversalCookie.createNamedInstance('')).toThrow('Cookie name must not be empty');
	});

	it('keeps module-level instances isolated between concurrent server requests', async () => {
		const session = UniversalCookie.createNamedInstance<string>('session', { path: '/', httpOnly: true });
		const firstCookies = createCookieJar();
		const secondCookies = createCookieJar();
		let releaseFirst!: () => void;
		const firstBarrier = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const firstRequest = edgesHandleRaw({ cookies: firstCookies, url: new URL('https://example.com/first') } as never, async () => {
			session.set('first');
			await firstBarrier;
			return new Response(session.get());
		});
		const secondRequest = edgesHandleRaw({ cookies: secondCookies, url: new URL('https://example.com/second') } as never, async () => {
			session.set('second');
			releaseFirst();
			return new Response(session.get());
		});

		const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);

		await expect(firstResponse.text()).resolves.toBe('first');
		await expect(secondResponse.text()).resolves.toBe('second');
		expect(firstCookies.values.get('session')).toBe('first');
		expect(secondCookies.values.get('session')).toBe('second');
	});
});
