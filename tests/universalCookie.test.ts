import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@azure-net/edges/context';
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
});
