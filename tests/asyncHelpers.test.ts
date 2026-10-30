import { describe, expect, it, vi } from 'vitest';
import { createAsyncAction, createAsyncResource } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import { AppError } from '../src/lib/shared/app-error/AppError.js';

describe('stateless AsyncHelpers', () => {
	it('runs beforeSend, action and success in order', async () => {
		const order: string[] = [];
		const result = await createAsyncAction(
			async () => {
				order.push('action');
				return 42;
			},
			{
				beforeSend: async ({ next }) => {
					await Promise.resolve();
					order.push('before');
					next();
				},
				onSuccess: async ({ response }) => {
					order.push('success');
					expect(response).toBe(42);
				}
			}
		);
		expect(result).toEqual({ response: 42, success: true });
		expect(order).toEqual(['before', 'action', 'success']);
	});
	it('aborts beforeSend without invoking the action', async () => {
		const action = vi.fn(async () => 1);
		const result = await createAsyncAction(action, { beforeSend: ({ abort }) => abort() });
		expect(action).not.toHaveBeenCalled();
		expect(result.error?.type).toBe('AsyncHelperError');
	});
	it('supports an awaited beforeSend without explicit next', async () => {
		await expect(createAsyncAction(async () => 1, { beforeSend: async () => {} })).resolves.toMatchObject({ success: true });
	});
	it('does not retry and delivers the converted failure and fallback once', async () => {
		const action = vi.fn(async () => {
			throw new Error('failed');
		});
		const onError = vi.fn();
		const result = await createAsyncAction(action, { fallbackResponse: 'fallback', onError });
		expect(result).toMatchObject({ success: false, response: 'fallback', error: { message: 'failed' } });
		expect(action).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledExactlyOnceWith(result);
	});
	it('preserves an already normalized AppError', async () => {
		const error = new AppError(new Error('failed'));
		error.redeclareValidation({ name: 'invalid' });
		const result = await createAsyncAction(async () => {
			throw error;
		});
		expect(result.error?.validation).toEqual({ name: 'invalid' });
	});
	it.each(['onSuccess', 'onError'] as const)('propagates %s exceptions without retry or rehandling', async (hook) => {
		const failure = new Error('callback failed');
		const callback = vi.fn(() => {
			throw failure;
		});
		const action = vi.fn(async () => {
			if (hook === 'onError') throw new Error('request');
			return 1;
		});
		await expect(createAsyncAction(action, { [hook]: callback })).rejects.toBe(failure);
		expect(callback).toHaveBeenCalledTimes(1);
		expect(action).toHaveBeenCalledTimes(1);
	});
	it('returns resource fallback or rejects with a converted error', async () => {
		const action = async () => {
			throw new Error('failed');
		};
		await expect(createAsyncResource(action, { fallbackResponse: 'empty' })).resolves.toBe('empty');
		await expect(createAsyncResource(action, { reject: true })).rejects.toMatchObject({ message: 'failed', appErrorConvert: true });
	});
});
