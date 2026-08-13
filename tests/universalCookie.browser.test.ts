import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store, cookieSet, cookieGet, cookieGetAll } = vi.hoisted(() => {
	const values = new Map<string, string>();
	return {
		store: values,
		cookieSet: vi.fn((name: string, value: string) => values.set(name, value)),
		cookieGet: vi.fn((name: string) => values.get(name) ?? null),
		cookieGetAll: vi.fn(() => Object.fromEntries(values))
	};
});

vi.mock('@azure-net/tools/environment', async (importOriginal) => ({
	...(await importOriginal<typeof import('@azure-net/tools/environment')>()),
	BROWSER: true
}));

vi.mock('@azure-net/tools', async (importOriginal) => ({
	...(await importOriginal<typeof import('@azure-net/tools')>()),
	Cookies: {
		set: cookieSet,
		get: cookieGet,
		getAll: cookieGetAll
	}
}));

import { UniversalCookie } from '../src/lib/shared/cookie/UniversalCookie.js';

describe('UniversalCookie in the browser', () => {
	beforeEach(() => {
		store.clear();
		vi.clearAllMocks();
	});

	it('uses the same serialization as the server branch', () => {
		UniversalCookie.set('profile', { name: 'Ada' });
		UniversalCookie.set('literal', 'false');

		expect(cookieSet).toHaveBeenCalledWith('profile', '{"name":"Ada"}', undefined);
		expect(UniversalCookie.get('profile')).toEqual({ name: 'Ada' });
		expect(UniversalCookie.get('literal')).toBe(false);
		expect(UniversalCookie.getAll()).toEqual({ profile: { name: 'Ada' }, literal: false });
	});
});
