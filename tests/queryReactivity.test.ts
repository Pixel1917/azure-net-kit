// @vitest-environment jsdom

import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { QueryController } from '../src/lib/svelte/query/Query.svelte.js';
import QueryHarness from './fixtures/QueryHarness.svelte';

describe('query.createEffect', () => {
	it('tracks all query values deeply when dependencies are omitted', async () => {
		const callback = vi.fn();
		let query!: QueryController<{ filters: { page: number }; search: string }>;
		const view = render(QueryHarness, {
			initial: { filters: { page: 1 }, search: '' },
			setup: (value) => value.createEffect(callback),
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		expect(callback).toHaveBeenCalledTimes(1);

		query.data.filters.page = 2;
		await tick();
		expect(callback).toHaveBeenCalledTimes(2);

		query.patch({ search: 'azure' });
		await tick();
		expect(callback).toHaveBeenCalledTimes(3);
		view.unmount();
	});

	it('tracks only an exact nested path', async () => {
		const callback = vi.fn();
		let query!: QueryController<{
			filters: { page: number; options: { archived: boolean } };
			ignored: { value: number };
		}>;
		const view = render(QueryHarness, {
			initial: {
				filters: { page: 1, options: { archived: false } },
				ignored: { value: 1 }
			},
			setup: (value) => value.createEffect(callback, ['filters.page']),
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		callback.mockClear();

		query.data.filters.options.archived = true;
		query.data.ignored.value += 1;
		await tick();
		expect(callback).not.toHaveBeenCalled();

		query.data.filters.page += 1;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('does not rerun an exact primitive path when its parent is replaced with the same value', async () => {
		const callback = vi.fn();
		let query!: QueryController<{ filters: { page: number; search: string } }>;
		const view = render(QueryHarness, {
			initial: { filters: { page: 1, search: '' } },
			setup: (value) => value.createEffect(callback, ['filters.page']),
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		callback.mockClear();
		query.data.filters = { page: 1, search: 'changed' };
		await tick();
		expect(callback).not.toHaveBeenCalled();

		query.data.filters = { page: 2, search: 'changed' };
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('tracks a selected object path deeply', async () => {
		const callback = vi.fn();
		let query!: QueryController<{ filters: { page: number; options: { archived: boolean } }; search: string }>;
		const view = render(QueryHarness, {
			initial: { filters: { page: 1, options: { archived: false } }, search: '' },
			setup: (value) => value.createEffect(callback, ['filters']),
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		callback.mockClear();
		query.data.filters.options.archived = true;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);

		callback.mockClear();
		query.data.search = 'ignored';
		await tick();
		expect(callback).not.toHaveBeenCalled();
		view.unmount();
	});

	it('runs once and does not subscribe when dependencies are empty', async () => {
		const callback = vi.fn();
		let query!: QueryController<{ page: number }>;
		const view = render(QueryHarness, {
			initial: { page: 1 },
			setup: (value) => value.createEffect(callback, []),
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		query.data.page = 2;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('deduplicates paths and coalesces synchronous changes', async () => {
		const callback = vi.fn();
		let query!: QueryController<{ filters: { page: number }; sort: { field: string } }>;
		const view = render(QueryHarness, {
			initial: { filters: { page: 1 }, sort: { field: 'name' } },
			setup: (value) => value.createEffect(callback, ['filters.page', 'sort.field', 'filters.page']),
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		callback.mockClear();
		query.data.filters.page = 2;
		query.data.sort.field = 'createdAt';
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('does not track query reads performed by the callback', async () => {
		let query!: QueryController<{ watched: number; ignored: number }>;
		const callback = vi.fn(() => {
			void query.data.ignored;
		});
		const view = render(QueryHarness, {
			initial: { watched: 1, ignored: 1 },
			setup: (value) => value.createEffect(callback, ['watched']),
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		callback.mockClear();
		query.data.ignored = 2;
		await tick();
		expect(callback).not.toHaveBeenCalled();

		query.data.watched = 2;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('reacts when reset replaces a selected value', async () => {
		const callback = vi.fn();
		let query!: QueryController<{ filters: { page: number } }>;
		const view = render(QueryHarness, {
			initial: { filters: { page: 1 } },
			setup: (value) => value.createEffect(callback, ['filters.page']),
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		query.data.filters.page = 2;
		await tick();
		callback.mockClear();
		query.reset();
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});
});
