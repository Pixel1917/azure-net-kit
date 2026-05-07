import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@azure-net/edges/context';
const publish = vi.fn();

vi.mock('$lib/core/index.js', () => ({
	AppEvents: () => ({ bus: { publish } })
}));

import { createAsyncHelpers, type AsyncHelperRetry } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import { createErrorHandler } from '../src/lib/delivery/injectable-dependencies/ErrorHandler.js';

const createServerContext = () => ({
	data: {},
	event: {
		fetch,
		url: new URL('https://example.com')
	}
});

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
		expect(result.error?.type).toBe('AsyncHelperError');
		expect(result.response).toBeUndefined();
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

	it('supports retry via custom handler callback', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);
		let calls = 0;
		const handler = async (error: Error, retry?: AsyncHelperRetry) => {
			await retry?.call?.();
			return {
				type: 'Unknown',
				message: error.message,
				external: false,
				appErrorConvert: true
			} as never;
		};
		const { createAsyncAction, useHandler } = createAsyncHelpers();
		useHandler(handler);

		const result = await createAsyncAction(async () => {
			calls += 1;
			if (calls === 1) throw new Error('first fail');
			return { ok: true, calls };
		});

		expect(result.success).toBe(true);
		expect(result.response).toEqual({ ok: true, calls: 2 });
	});

	it('keeps server handlers isolated by request context', async () => {
		let context = createServerContext();
		RequestContext.init(() => context as never);

		const { createAsyncAction, useHandler } = createAsyncHelpers<{ marker: string }>();
		useHandler(createErrorHandler(async (error) => error.toPlainObject({ marker: 'first' })));

		context = createServerContext();
		useHandler(createErrorHandler(async (error) => error.toPlainObject({ marker: 'second' })));

		context = createServerContext();
		const fallbackResult = await createAsyncAction(
			async () => {
				throw new Error('fallback');
			},
			{ fallbackResponse: { ok: false } }
		);

		expect(fallbackResult.error?.marker).toBeUndefined();

		context = createServerContext();
		useHandler(createErrorHandler(async (error) => error.toPlainObject({ marker: 'current' })));

		const currentResult = await createAsyncAction(
			async () => {
				throw new Error('current');
			},
			{ fallbackResponse: { ok: false } }
		);

		expect(currentResult.error?.marker).toBe('current');
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
		expect(result.error?.type).toBe('Unknown');
		expect(publish).not.toHaveBeenCalled();
	});
});
