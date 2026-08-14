// @vitest-environment jsdom

import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryController } from '../src/lib/svelte/query/Query.svelte.js';
import QueryHarness from './fixtures/QueryHarness.svelte';

const navigation = vi.hoisted(() => ({
	page: {
		state: {} as Record<string, unknown>,
		url: new URL('http://localhost/')
	},
	replaceState: vi.fn()
}));

vi.mock('$app/state', () => ({ page: navigation.page }));
vi.mock('$app/navigation', () => ({
	replaceState: (url: string | URL, state: Record<string, unknown>) => {
		navigation.replaceState(url, state);
		navigation.page.url = new URL(url, navigation.page.url);
		navigation.page.state = state;
	}
}));

describe('createQuery search params synchronization', () => {
	beforeEach(() => {
		navigation.page.url = new URL('http://localhost/');
		navigation.page.state = { preserved: true };
		navigation.replaceState.mockClear();
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
		expect(navigation.replaceState).not.toHaveBeenCalled();
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

		expect(navigation.replaceState).toHaveBeenCalledTimes(1);
		expect(navigation.replaceState).toHaveBeenCalledWith(expect.any(URL), { preserved: true });
		expect(navigation.page.url.pathname).toBe('/catalog');
		expect(navigation.page.url.hash).toBe('#results');
		expect(navigation.page.url.searchParams.get('utm_source')).toBe('test');
		expect(navigation.page.url.searchParams.get('page')).toBe('3');
		expect(navigation.page.url.searchParams.get('search')).toBe('azure net');
		expect(navigation.page.url.searchParams.getAll('tags')).toEqual(['kit', 'svelte']);
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
		expect(navigation.replaceState).toHaveBeenCalledTimes(1);
		expect(navigation.page.url.searchParams.get('page')).toBe('2');
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
		expect(navigation.replaceState).not.toHaveBeenCalled();
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
		expect(navigation.replaceState).not.toHaveBeenCalled();

		query.patch({ page: 8, search: 'azure' });
		await tick();
		expect(navigation.page.url.searchParams.get('p')).toBe('8');
		expect(navigation.page.url.searchParams.get('q')).toBe('azure');
		expect(navigation.page.url.searchParams.get('utm_source')).toBe('test');
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
		expect(navigation.page.url.searchParams.get('page')).toBe('1');
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
		expect(navigation.replaceState).not.toHaveBeenCalled();
		view.unmount();
	});
});
