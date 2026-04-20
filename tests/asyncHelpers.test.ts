import { beforeEach, describe, expect, it, vi } from 'vitest';

const publish = vi.fn();

vi.mock('$lib/core/index.js', () => ({
	AppEvents: () => ({ bus: { publish } })
}));

import { createAsyncHelpers } from '../src/lib/core/delivery/injectableDependencies/AsyncHelpers.js';

describe('AsyncHelpers', () => {
	beforeEach(() => {
		publish.mockReset();
	});

	it('aborts action in beforeSend when abort() is called', async () => {
		const { createAsyncAction } = createAsyncHelpers();
		const result = await createAsyncAction(async () => ({ ok: true }), {
			beforeSend: ({ abort }) => abort(),
			fallbackResponse: { ok: false }
		});

		expect(result.success).toBe(false);
		expect(result.error?.type).toBe('abort');
		expect(result.response).toEqual({ ok: false });
	});

	it('continues action when beforeSend returns without calling next/abort', async () => {
		const { createAsyncAction } = createAsyncHelpers();
		const result = await createAsyncAction(async () => ({ ok: true }), {
			beforeSend: async () => {
				await Promise.resolve();
			}
		});

		expect(result.success).toBe(true);
		expect(result.response).toEqual({ ok: true });
	});

	it('supports retry via custom parseError callback', async () => {
		let calls = 0;
		const { createAsyncAction } = createAsyncHelpers({
			parseError: async (_error, retry) => {
				await retry?.();
				return { type: 'app', message: 'retrying' } as never;
			}
		});

		const result = await createAsyncAction(async () => {
			calls += 1;
			if (calls === 1) throw new Error('first fail');
			return { ok: true, calls };
		});

		expect(result.success).toBe(true);
		expect(result.response).toEqual({ ok: true, calls: 2 });
	});

	it('publishes app event on unrecovered error', async () => {
		const { createAsyncAction } = createAsyncHelpers();
		const result = await createAsyncAction(
			async () => {
				throw new Error('fatal');
			},
			{ fallbackResponse: { ok: false } }
		);

		expect(result.success).toBe(false);
		expect(publish).toHaveBeenCalledTimes(1);
	});
});
