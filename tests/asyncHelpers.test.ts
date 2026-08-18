import { RequestContext } from '@azure-net/edges/context';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAsyncHelpers } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import { createApp, type AppAzureNetKitErrorCallback } from '../src/lib/shared/app/index.js';

const createServerContext = () => ({
	data: {},
	event: {
		fetch,
		url: new URL('https://example.com'),
		request: new Request('https://example.com')
	}
});

const runInApp = async <T>(action: () => Promise<T>, errorHandler?: AppAzureNetKitErrorCallback<Record<string, unknown>>): Promise<T> => {
	const context = createServerContext();
	RequestContext.init(() => context as never);
	let result!: T;
	const app = createApp((builder) => {
		const configured = errorHandler ? builder.useAzureNetKitError(errorHandler) : builder;
		return configured.useServer(async () => {
			result = await action();
		});
	});

	await app.register.handle({
		event: context.event,
		resolve: () => new Response('ok')
	} as never);

	return result;
};

describe('AsyncHelpers', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('exposes only stateless action and resource helpers', () => {
		expect(Object.keys(createAsyncHelpers()).sort()).toEqual(['createAsyncAction', 'createAsyncResource']);
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

	it('continues action when beforeSend returns without calling next or abort', async () => {
		const { createAsyncAction } = createAsyncHelpers();
		const result = await createAsyncAction(async () => ({ ok: true }), {
			beforeSend: async () => {
				await Promise.resolve();
			}
		});

		expect(result).toEqual({ success: true, response: { ok: true } });
	});

	it('uses the default AppError conversion when the app hook is absent', async () => {
		const { createAsyncAction } = createAsyncHelpers();
		const result = await createAsyncAction(async () => {
			throw new Error('fatal');
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatchObject({
			type: 'Unknown',
			message: 'fatal',
			external: false,
			appErrorConvert: true
		});
	});

	it('routes errors through createApp and preserves custom result typing', async () => {
		const { createAsyncAction } = createAsyncHelpers<{ marker: string }>();
		const result = await runInApp(
			() =>
				createAsyncAction(async () => {
					throw new Error('custom');
				}),
			({ error, retry, AppEvents, isServer, isClient, requestContext, event }) => {
				expect(retry.can).toBe(true);
				expect(typeof retry.call).toBe('function');
				expect(typeof AppEvents).toBe('function');
				expect(isServer).toBe(true);
				expect(isClient).toBe(false);
				expect(requestContext?.event).toBe(event);
				return error.toPlainObject({ marker: 'app' });
			}
		);

		expect(result.error?.marker).toBe('app');
	});

	it('supports retry from the application error hook', async () => {
		let calls = 0;
		const { createAsyncAction } = createAsyncHelpers();
		const result = await runInApp(
			() =>
				createAsyncAction(async () => {
					calls += 1;
					if (calls === 1) throw new Error('first fail');
					return { ok: true, calls };
				}),
			async ({ error, retry }) => {
				await retry.call?.();
				return error.toPlainObject();
			}
		);

		expect(result).toEqual({ success: true, response: { ok: true, calls: 2 } });
	});

	it('keeps the failed response when retry also fails', async () => {
		let calls = 0;
		const { createAsyncAction } = createAsyncHelpers();
		const result = await runInApp(
			() =>
				createAsyncAction(
					async () => {
						calls += 1;
						throw new Error(`failure ${calls}`);
					},
					{ fallbackResponse: 'fallback' }
				),
			async ({ error, retry }) => {
				await retry.call?.();
				return error.toPlainObject();
			}
		);

		expect(calls).toBe(2);
		expect(result.success).toBe(false);
		expect(result.response).toBe('fallback');
	});

	it('routes onError callback failures through the same application hook', async () => {
		const seen: string[] = [];
		const { createAsyncAction } = createAsyncHelpers();

		await expect(
			runInApp(
				() =>
					createAsyncAction(
						async () => {
							throw new Error('request failed');
						},
						{
							onError: () => {
								throw new Error('consumer failed');
							}
						}
					),
				({ error }) => {
					seen.push(error.type);
					return error.toPlainObject();
				}
			)
		).rejects.toMatchObject({ type: 'AsyncHelperError', appErrorConvert: true });

		expect(seen).toEqual(['Unknown', 'AsyncHelperError']);
	});

	it('rejects createAsyncResource with the converted error when reject is enabled', async () => {
		const { createAsyncResource } = createAsyncHelpers<{ code: string }>();

		await expect(
			runInApp(
				() =>
					createAsyncResource(
						async () => {
							throw new Error('resource failed');
						},
						{ reject: true }
					),
				({ error }) => error.toPlainObject({ code: 'RESOURCE' })
			)
		).rejects.toMatchObject({ code: 'RESOURCE', message: 'resource failed' });
	});

	it('rejects an invalid hook result instead of leaking an unconverted error shape', async () => {
		const { createAsyncAction } = createAsyncHelpers();

		await expect(
			runInApp(
				() =>
					createAsyncAction(async () => {
						throw new Error('failure');
					}),
				(() => ({ message: 'invalid' })) as never
			)
		).rejects.toThrow("[createApp] 'useAzureNetKitError' must return the result of AppError.toPlainObject().");
	});

	it('propagates a hook exception exactly once', async () => {
		const hookError = new Error('hook failed');
		const hook = vi.fn(() => {
			throw hookError;
		});
		const { createAsyncAction } = createAsyncHelpers();

		await expect(
			runInApp(
				() =>
					createAsyncAction(async () => {
						throw new Error('failure');
					}),
				hook as never
			)
		).rejects.toBe(hookError);
		expect(hook).toHaveBeenCalledTimes(1);
	});
});
