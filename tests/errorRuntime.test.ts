import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContext, type ContextData } from '@azure-net/edges/context';
import { describe, expect, it } from 'vitest';
import { createAsyncHelpers } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import { HttpErrorTypes, HttpServiceError } from '../src/lib/infra/http-service/HttpServiceInstance.js';
import { SchemaFail } from '../src/lib/delivery/schema/Schema.js';
import { createApp } from '../src/lib/shared/app/index.js';

type TestContext = ContextData & { data: { marker: string } & ContextData['data'] };

const createContext = (marker: string): TestContext => ({
	data: { marker },
	event: {
		fetch,
		url: new URL(`https://example.com/${marker}`),
		request: new Request(`https://example.com/${marker}`)
	} as never
});

describe('AzureNetKit error runtime', () => {
	it('keeps concurrent server error hooks isolated and releases request bindings', async () => {
		const storage = new AsyncLocalStorage<TestContext>();
		RequestContext.init(() => {
			const context = storage.getStore();
			if (!context) throw new Error('Missing test request context');
			return context;
		});

		const helpers = createAsyncHelpers<{ marker: string }>();
		const results = new Map<string, string | undefined>();
		const app = createApp((builder) =>
			builder.useAzureNetKitError(async ({ error, requestContext, event }) => {
				const marker = (requestContext?.data as { marker: string }).marker;
				await new Promise((resolve) => setTimeout(resolve, marker.charCodeAt(0) % 4));
				expect(event).toBe(requestContext?.event);
				return error.toPlainObject({ marker });
			})
		);

		const contexts = Array.from({ length: 40 }, (_, index) => createContext(`request-${index}`));
		await Promise.all(
			contexts.map((context) =>
				storage.run(context, async () => {
					await app.register.handle({
						event: context.event,
						resolve: async () => {
							await Promise.resolve();
							const result = await helpers.createAsyncAction(async () => {
								throw new Error(context.data.marker);
							});
							results.set(context.data.marker, result.error?.marker);
							return new Response('ok');
						}
					} as never);
				})
			)
		);

		for (const context of contexts) {
			expect(results.get(context.data.marker)).toBe(context.data.marker);
			expect(Reflect.ownKeys(context.data).filter((key) => typeof key === 'symbol')).toHaveLength(0);
		}
	});

	it('releases the request binding when handle throws', async () => {
		const context = createContext('throwing');
		RequestContext.init(() => context);
		const app = createApp((builder) => builder.useAzureNetKitError(({ error }) => error.toPlainObject()));

		await expect(
			app.register.handle({
				event: context.event,
				resolve: () => {
					throw new Error('resolve failed');
				}
			} as never)
		).rejects.toThrow('resolve failed');
		expect(Reflect.ownKeys(context.data).filter((key) => typeof key === 'symbol')).toHaveLength(0);
	});

	it('does not retain resolver bindings after repeated requests', async () => {
		let context = createContext('initial');
		RequestContext.init(() => context);
		const helpers = createAsyncHelpers();
		const app = createApp((builder) => builder.useAzureNetKitError(({ error }) => error.toPlainObject()));

		for (let index = 0; index < 250; index += 1) {
			context = createContext(`request-${index}`);
			await app.register.handle({
				event: context.event,
				resolve: async () => {
					await helpers.createAsyncAction(async () => {
						throw new Error('expected');
					});
					return new Response('ok');
				}
			} as never);

			expect(Reflect.ownKeys(context.data).filter((key) => typeof key === 'symbol')).toHaveLength(0);
		}
	});

	it('maps HttpServiceError through the default conversion', async () => {
		const { createAsyncAction } = createAsyncHelpers();
		const result = await createAsyncAction(async () => {
			throw new HttpServiceError({
				data: { reason: 'bad request' },
				status: 400,
				message: 'Request failed',
				type: HttpErrorTypes.External
			});
		});

		expect(result.error).toMatchObject({ type: 'Http', external: true, message: 'Request failed' });
	});

	it('maps SchemaFail validation through the default conversion', async () => {
		const { createAsyncAction } = createAsyncHelpers();
		const result = await createAsyncAction(async () => {
			throw new SchemaFail<Record<string, unknown>>({ name: 'required' } as never);
		});

		expect(result.error).toMatchObject({ type: 'Schema', validation: { name: 'required' } });
	});
});
