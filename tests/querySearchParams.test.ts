// @vitest-environment jsdom

import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryController } from '../src/lib/svelte/query/Query.svelte.js';
import QueryHarness from './fixtures/QueryHarness.svelte';

const navigation = vi.hoisted(() => ({
	page: {
		state: {} as Record<string, unknown>,
		shallow: null as { url: URL } | null,
		url: new URL('http://localhost/')
	},
	goto: vi.fn()
}));

vi.mock('$app/state', () => ({ page: navigation.page }));
vi.mock('$app/navigation', () => ({
	goto: async (url: string | URL, options: { state: Record<string, unknown>; shallow: boolean; replace: boolean; reset: boolean }) => {
		navigation.goto(url, options);
		navigation.page.shallow = { url: new URL(url, navigation.page.url) };
		navigation.page.state = options.state;
	}
}));

describe('createQuery search params synchronization', () => {
	beforeEach(() => {
		navigation.page.url = new URL('http://localhost/');
		navigation.page.shallow = null;
		navigation.page.state = { preserved: true };
		navigation.goto.mockClear();
	});

	it('hydrates known query keys with inferred basic types before the first effect', async () => {
		navigation.page.url = new URL(
			'http://localhost/catalog?page=4&archived=true&createdAt=2026-08-15T10%3A00%3A00.000Z&tags=one&tags=two&filters=%7B%22category%22%3A%22books%22%7D&unknown=keep'
		);
		let query!: QueryController<{
			page: number;
			archived: boolean;
			createdAt: Date;
			tags: string[];
			filters: { category: string };
		}>;
		const view = render(QueryHarness, {
			initial: {
				page: 1,
				archived: false,
				createdAt: new Date('2025-01-01T00:00:00.000Z'),
				tags: [] as string[],
				filters: { category: '' }
			},
			options: { syncWithSearchParams: true },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		expect(query.data).toEqual({
			page: 4,
			archived: true,
			createdAt: new Date('2026-08-15T10:00:00.000Z'),
			tags: ['one', 'two'],
			filters: { category: 'books' }
		});

		await tick();
		expect(navigation.goto).not.toHaveBeenCalled();
		view.unmount();
	});

	it('updates the current URL once, preserves unrelated params and page state', async () => {
		navigation.page.url = new URL('http://localhost/catalog?page=2&utm_source=test#results');
		let query!: QueryController<{ page: number; search: string; tags: string[] }>;
		const view = render(QueryHarness, {
			initial: { page: 1, search: '', tags: [] },
			options: { syncWithSearchParams: true },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		query.data.page = 3;
		query.data.search = 'azure net';
		query.data.tags.push('kit', 'svelte');
		await tick();

		expect(navigation.goto).toHaveBeenCalledTimes(1);
		expect(navigation.goto).toHaveBeenCalledWith(expect.any(URL), { state: { preserved: true }, shallow: true, replace: true, reset: false });
		expect(navigation.page.shallow!.url.pathname).toBe('/catalog');
		expect(navigation.page.shallow!.url.hash).toBe('#results');
		expect(navigation.page.shallow!.url.searchParams.get('utm_source')).toBe('test');
		expect(navigation.page.shallow!.url.searchParams.get('page')).toBe('3');
		expect(navigation.page.shallow!.url.searchParams.get('search')).toBe('azure net');
		expect(navigation.page.shallow!.url.searchParams.getAll('tags')).toEqual(['kit', 'svelte']);
		view.unmount();
	});

	it('does not lose a synchronous query change made before the first effect run', async () => {
		let query!: QueryController<{ page: number }>;
		const view = render(QueryHarness, {
			initial: { page: 1 },
			options: { syncWithSearchParams: true },
			setup: (value) => {
				value.data.page = 2;
			},
			expose: (value) => {
				query = value as typeof query;
			}
		});

		expect(query.data.page).toBe(2);
		await tick();
		expect(navigation.goto).toHaveBeenCalledTimes(1);
		expect(navigation.page.shallow!.url.searchParams.get('page')).toBe('2');
		view.unmount();
	});

	it('keeps declared defaults for invalid URL values', async () => {
		navigation.page.url = new URL('http://localhost/?page=nope&enabled=sometimes&createdAt=invalid');
		let query!: QueryController<{ page: number; enabled: boolean; createdAt: Date }>;
		const view = render(QueryHarness, {
			initial: { page: 1, enabled: false, createdAt: new Date('2026-01-01T00:00:00.000Z') },
			options: { syncWithSearchParams: true },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		expect(query.data).toEqual({ page: 1, enabled: false, createdAt: new Date('2026-01-01T00:00:00.000Z') });
		await tick();
		expect(navigation.goto).not.toHaveBeenCalled();
		view.unmount();
	});

	it('infers custom codec types and only overrides the configured direction', async () => {
		navigation.page.url = new URL('http://localhost/?p=7&utm_source=test');
		const fromSearchParams = vi.fn((params: URLSearchParams, initial: Readonly<{ page: number; search: string }>) => ({
			page: Number(params.get('p') ?? initial.page)
		}));
		const toSearchParams = vi.fn((data: Readonly<{ page: number; search: string }>) => {
			const params = new URLSearchParams();
			params.set('p', String(data.page));
			if (data.search) params.set('q', data.search);
			return params;
		});
		let query!: QueryController<{ page: number; search: string }>;
		const view = render(QueryHarness, {
			initial: { page: 1, search: '' },
			options: { syncWithSearchParams: { fromSearchParams, toSearchParams } },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		expect(query.data).toEqual({ page: 7, search: '' });
		await tick();
		expect(navigation.goto).not.toHaveBeenCalled();

		query.patch({ page: 8, search: 'azure' });
		await tick();
		expect(navigation.page.shallow!.url.searchParams.get('p')).toBe('8');
		expect(navigation.page.shallow!.url.searchParams.get('q')).toBe('azure');
		expect(navigation.page.shallow!.url.searchParams.get('utm_source')).toBe('test');
		view.unmount();
	});

	it('resets to declared defaults rather than values hydrated from the URL', async () => {
		navigation.page.url = new URL('http://localhost/?page=5');
		let query!: QueryController<{ page: number }>;
		const view = render(QueryHarness, {
			initial: { page: 1 },
			options: { syncWithSearchParams: true },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		expect(query.data.page).toBe(5);
		expect(query.getInitial().page).toBe(1);
		query.reset();
		await tick();
		expect(query.data.page).toBe(1);
		expect(navigation.page.shallow!.url.searchParams.get('page')).toBe('1');
		view.unmount();
	});

	it('does nothing when synchronization is false or omitted', async () => {
		navigation.page.url = new URL('http://localhost/?page=9');
		let query!: QueryController<{ page: number }>;
		const view = render(QueryHarness, {
			initial: { page: 1 },
			options: { syncWithSearchParams: false },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		expect(query.data.page).toBe(1);
		query.data.page = 2;
		await tick();
		expect(navigation.goto).not.toHaveBeenCalled();
		view.unmount();
	});
});

it('merges URL parameters over closure defaults and resets without calling the closure again', async () => {
	navigation.page.url = new URL('http://localhost/?page=7');
	const initial = vi.fn(() => ({ page: 1, perPage: 12 }));
	let query!: QueryController<Record<string, unknown>>;
	const view = render(QueryHarness, {
		initial,
		options: { syncWithSearchParams: true },
		expose: (value) => {
			query = value;
		}
	});
	await tick();
	expect(query.data).toEqual({ page: 7, perPage: 12 });
	query.reset();
	await tick();
	expect(query.data).toEqual({ page: 1, perPage: 12 });
	expect(initial).toHaveBeenCalledTimes(1);
	view.unmount();
});

it('uses the shallow URL for initialization and subsequent updates instead of the stale page URL', async () => {
	navigation.page.url = new URL('http://localhost/catalog?page=1');
	navigation.page.shallow = { url: new URL('http://localhost/catalog?page=4&utm_source=shallow#anchor') };
	let query!: QueryController<Record<string, unknown>>;
	const view = render(QueryHarness, {
		initial: { page: 1 },
		options: { syncWithSearchParams: true },
		expose: (value) => {
			query = value;
		}
	});
	await tick();
	expect(query.data.page).toBe(4);
	query.patch({ page: 5 });
	await tick();
	query.reset();
	await tick();
	expect(navigation.page.url.searchParams.get('page')).toBe('1');
	expect(navigation.page.shallow.url.searchParams.get('page')).toBe('1');
	expect(navigation.page.shallow.url.searchParams.get('utm_source')).toBe('shallow');
	expect(navigation.page.shallow.url.hash).toBe('#anchor');
	view.unmount();
});
