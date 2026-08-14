// @vitest-environment jsdom

import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { QueryController } from '../src/lib/svelte/query/Query.svelte.js';
import QueryHarness from './fixtures/QueryHarness.svelte';

describe('createQuery onChange', () => {
	it('reacts to deep mutations of included keys only', async () => {
		const handler = vi.fn();
		let query!: QueryController<{
			filters: { page: number; options: { archived: boolean } };
			ignored: { value: number };
		}>;
		const view = render(QueryHarness, {
			initial: {
				filters: { page: 1, options: { archived: false } },
				ignored: { value: 1 }
			},
			options: { onChange: { include: ['filters'], handler } },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		handler.mockClear();
		query.data.filters.page += 1;
		await tick();

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenLastCalledWith(
			expect.objectContaining({
				changedKeys: ['filters'],
				snapshot: expect.objectContaining({ filters: { page: 2, options: { archived: false } } })
			})
		);

		handler.mockClear();
		query.data.ignored.value += 1;
		await tick();
		expect(handler).not.toHaveBeenCalled();
		view.unmount();
	});

	it('coalesces nested mutations of multiple included keys into one change', async () => {
		const handler = vi.fn();
		let query!: QueryController<{ filters: { page: number }; sort: { field: string } }>;
		const view = render(QueryHarness, {
			initial: { filters: { page: 1 }, sort: { field: 'name' } },
			options: { onChange: { include: ['filters', 'sort'], handler } },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		handler.mockClear();
		query.data.filters.page = 2;
		query.data.sort.field = 'createdAt';
		await tick();

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0][0].changedKeys).toEqual(['filters', 'sort']);
		view.unmount();
	});

	it('aborts the previous handler when a newer deep change starts', async () => {
		const signals: AbortSignal[] = [];
		const handler = vi.fn(({ signal }: { signal: AbortSignal }) => {
			signals.push(signal);
			return new Promise<void>(() => undefined);
		});
		let query!: QueryController<{ filters: { page: number } }>;
		const view = render(QueryHarness, {
			initial: { filters: { page: 1 } },
			options: { onChange: { include: ['filters'], handler } },
			expose: (value) => {
				query = value as typeof query;
			}
		});

		await tick();
		query.data.filters.page = 2;
		await tick();
		query.data.filters.page = 3;
		await tick();

		expect(handler).toHaveBeenCalledTimes(2);
		expect(signals[0].aborted).toBe(true);
		expect(signals[1].aborted).toBe(false);
		view.unmount();
		expect(signals[1].aborted).toBe(true);
	});
});
