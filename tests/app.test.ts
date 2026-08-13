import { RequestContext } from '@azure-net/edges/context';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/lib/shared/app/index.js';
import { AzureNetKitInternalError } from '../src/lib/shared/app-error/index.js';
import { LoggerErrors, useLogger } from '../src/lib/shared/logger/index.js';
import { BackgroundTask } from '../src/lib/shared/background-task/index.js';
import { ensureRoute } from '../src/lib/shared/app/middleware/Shared.js';
import type { IServerMiddleware } from '../src/lib/shared/app/index.js';

const createServerContext = () => ({
	data: {},
	event: {
		fetch,
		url: new URL('https://example.com/dashboard'),
		request: new Request('https://example.com/dashboard', {
			headers: {
				referer: 'https://example.com/login'
			}
		})
	}
});

describe('createApp', () => {
	it('matches static and dynamic routes exactly', () => {
		expect(ensureRoute('/', '/')).toBe(true);
		expect(ensureRoute('/', '/app/products')).toBe(false);
		expect(ensureRoute('/app/products/{id}', '/app/products/12')).toBe(true);
		expect(ensureRoute('/app/products/{id}', '/app/products/12/details')).toBe(false);
		expect(ensureRoute('/app/products/{id}/details/{detailId}', '/app/products/12/details/99')).toBe(true);
		expect(ensureRoute('/app/products/{id}/details/{detailId}', '/app/products/12/details')).toBe(false);
		expect(ensureRoute(['/login', '/app/products/{id}'], '/app/products/12')).toBe(true);
		expect(ensureRoute(['/login', '/app/products/{id}'], '/app/products')).toBe(false);
		expect(ensureRoute('/profile/{id}', new URL('https://example.com/profile/42'))).toBe(true);
	});

	it('resolves dependencies through boundary provider lazily', () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		let calls = 0;
		const { Container } = createApp((app) =>
			app.dependencies({
				Config: () => {
					calls += 1;
					return { apiUrl: 'https://example.com' };
				}
			})
		);

		expect(calls).toBe(0);
		expect(Container.Config.apiUrl).toBe('https://example.com');
		expect(Container.Config).toBe(Container.Config);
		expect(calls).toBe(1);
	});

	it('uses an isolated dependency cache for every server request context', () => {
		let context = createServerContext();
		RequestContext.init(() => context as never);

		let calls = 0;
		const { Container } = createApp((app) =>
			app.dependencies({
				RequestService: () => ({ id: ++calls })
			})
		);

		const first = Container.RequestService;
		expect(first.id).toBe(1);

		context = createServerContext();
		const second = Container.RequestService;
		expect(second.id).toBe(2);
		expect(second).not.toBe(first);
	});

	it('runs universal and server callbacks once per server request context', async () => {
		let context = createServerContext();
		RequestContext.init(() => context as never);

		const calls: string[] = [];
		const app = createApp((app) =>
			app
				.use(({ event, isServer, requestContext }) => {
					calls.push(`use:${isServer}:${event === context.event}:${requestContext === context}`);
				})
				.useServer(({ event, requestContext }) => {
					calls.push(`server:${event === context.event}:${requestContext === context}`);
				})
		);

		await app.register.handle({
			event: context.event,
			resolve: () => new Response('ok')
		} as never);
		await app.register.handle({
			event: context.event,
			resolve: () => new Response('ok')
		} as never);
		expect(calls).toEqual(['use:true:true:true', 'server:true:true']);

		context = createServerContext();
		await app.register.handle({
			event: context.event,
			resolve: () => new Response('ok')
		} as never);
		expect(calls).toEqual(['use:true:true:true', 'server:true:true', 'use:true:true:true', 'server:true:true']);
	});

	it('exposes a SvelteKit handle that runs server callbacks and resolves the event', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		let receivedEvent: unknown;
		const app = createApp((app) =>
			app.useServer(({ event }) => {
				receivedEvent = event;
			})
		);

		const response = new Response('ok');
		const result = await app.register.handle({
			event: context.event,
			resolve: (event: typeof context.event) => {
				expect(event).toBe(context.event);
				return response;
			}
		} as never);

		expect(receivedEvent).toBe(context.event);
		expect(result).toBe(response);
	});

	it('allows useServer callbacks to resolve the response manually', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		let resolveCalls = 0;
		const manualResponse = new Response('manual');
		const app = createApp((app) =>
			app.useServer(({ event, requestContext, resolve }) => {
				expect(requestContext).toBe(context);
				return resolve(event, {
					transformPageChunk: ({ html }) => html
				});
			})
		);

		const result = await app.register.handle({
			event: context.event,
			resolve: () => {
				resolveCalls += 1;
				return manualResponse;
			}
		} as never);

		expect(resolveCalls).toBe(1);
		expect(result).toBe(manualResponse);
	});

	it('does not run client callbacks on server', () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		let calls = 0;
		const app = createApp((app) =>
			app.useClient(() => {
				calls += 1;
			})
		);

		app.register();
		expect(calls).toBe(0);
	});

	it('detects circular dependencies through boundary provider guard', () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const { Container } = createApp((app) =>
			app.dependencies({
				First: (container) => container.Second,
				Second: (container) => container.First
			})
		);

		expect(() => Container.First).toThrow(
			'[BoundaryProvider] Circular provider dependency detected: __AzureNetKitGlobalAppContainer__.First -> __AzureNetKitGlobalAppContainer__.Second -> __AzureNetKitGlobalAppContainer__.First'
		);
	});

	it('does not allow async dependencies in AppContainer', () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const { Container } = createApp((app) =>
			app.dependencies({
				AsyncService: () => Promise.resolve({ ok: true })
			})
		);

		expect(() => Container.AsyncService).toThrow("Service 'AsyncService' in provider '__AzureNetKitGlobalAppContainer__' returned Promise.");
	});

	it('chains dependency registration and exposes dependencies to later factories', () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const { Container } = createApp((app) =>
			app
				.dependencies({
					Config: () => ({ baseUrl: 'https://api.example.com' })
				})
				.dependencies({
					Http: ({ Config }) => ({ url: `${Config.baseUrl}/v1` })
				})
		);

		expect(Container.Http.url).toBe('https://api.example.com/v1');
	});

	it('supports has/ownKeys/getOwnPropertyDescriptor proxy operations for AppContainer', () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const { Container } = createApp((app) =>
			app.dependencies({
				FeatureFlag: () => true
			})
		);

		expect('FeatureFlag' in Container).toBe(true);
		expect(Object.keys(Container)).toContain('FeatureFlag');
		expect(Object.getOwnPropertyDescriptor(Container, 'FeatureFlag')?.value).toBe(true);
	});

	it('runs async universal callback before server callback', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const calls: string[] = [];
		const app = createApp((app) =>
			app
				.use(async () => {
					await Promise.resolve();
					calls.push('universal');
				})
				.useServer(() => {
					calls.push('server');
				})
		);

		await app.register.handle({
			event: context.event,
			resolve: () => new Response('ok')
		} as never);

		expect(calls).toEqual(['universal', 'server']);
	});

	it('runs server init only once per app instance', async () => {
		const callback = vi.fn();
		const app = createApp((app) => app.useServerInit(callback));

		await Promise.all([app.register.serverInit(), app.register.serverInit()]);

		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledWith();
	});

	it('shares one pending server init between concurrent callers', async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const callback = vi.fn(() => pending);
		const app = createApp((app) => app.useServerInit(callback));

		const first = app.register.serverInit();
		const second = app.register.serverInit();

		expect(first).toBe(second);
		expect(callback).not.toHaveBeenCalled();
		release();
		await first;
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('runs server error callback with request context and error data', () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const callback = vi.fn();
		const app = createApp((app) => app.useServerError(callback));
		const error = new Error('boom');

		app.register.serverError({
			error,
			event: context.event,
			status: 500,
			message: 'Internal error'
		} as never);

		expect(callback).toHaveBeenCalledWith({
			Container: app.Container,
			requestContext: context,
			error,
			event: context.event,
			status: 500,
			message: 'Internal error',
			useLogger
		});
	});

	it('runs handleFetch with app dependencies and request context', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const upstream = vi.fn(() => Promise.resolve(new Response('upstream')));
		const request = new Request('https://api.example.com/items');
		const app = createApp((app) =>
			app
				.dependencies({ Marker: () => 'app' })
				.useServerFetch(({ Container, requestContext, event, request: receivedRequest, fetch: receivedFetch }) => {
					expect(Container.Marker).toBe('app');
					expect(requestContext).toBe(context);
					expect(event).toBe(context.event);
					expect(receivedRequest).toBe(request);
					expect(receivedFetch).toBe(upstream);
					return new Response('intercepted');
				})
		);

		const response = await app.register.serverFetch({ event: context.event, request, fetch: upstream } as never);
		expect(await response.text()).toBe('intercepted');
		expect(upstream).not.toHaveBeenCalled();
	});

	it('uses the native handleFetch fallback when no callback is configured', async () => {
		const request = new Request('https://api.example.com/items');
		const response = new Response('native');
		const upstream = vi.fn(() => Promise.resolve(response));
		const app = createApp((app) => app);

		await expect(app.register.serverFetch({ event: createServerContext().event, request, fetch: upstream } as never)).resolves.toBe(response);
		expect(upstream).toHaveBeenCalledWith(request);
	});

	it('runs handleValidationError with app dependencies and request context', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);
		const issues = [{ message: 'Invalid value' }];
		const app = createApp((app) =>
			app.dependencies({ Marker: () => 'app' }).useServerValidationError(({ Container, requestContext, event, issues: receivedIssues }) => {
				expect(Container.Marker).toBe('app');
				expect(requestContext).toBe(context);
				expect(event).toBe(context.event);
				expect(receivedIssues).toBe(issues);
				return { message: 'Custom validation error' };
			})
		);

		await expect(Promise.resolve(app.register.serverValidationError({ event: context.event, issues } as never))).resolves.toEqual({
			message: 'Custom validation error'
		});
	});

	it('uses the SvelteKit validation fallback when no callback is configured', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const issues = [{ message: 'Invalid value' }];
		const app = createApp((app) => app);

		expect(app.register.serverValidationError({ event: createServerContext().event, issues } as never)).toEqual({ message: 'Bad Request' });
		expect(error).toHaveBeenCalledWith('Remote function schema validation failed:', issues);
		error.mockRestore();
	});

	it('exposes reroute and transport hooks without altering their native contracts', async () => {
		const transport = {
			Date: {
				encode: (value: unknown) => value instanceof Date && value.toISOString(),
				decode: (value: string) => new Date(value)
			}
		};
		const reroute = vi.fn(({ url }: { url: URL }) => (url.pathname === '/old' ? '/new' : undefined));
		const app = createApp((app) => app.useReroute(reroute).useTransport(transport));

		await expect(Promise.resolve(app.register.reroute({ url: new URL('https://example.com/old'), fetch }))).resolves.toBe('/new');
		expect(app.register.transport).toBe(transport);
	});

	it.each(['useServerFetch', 'useServerValidationError', 'useReroute', 'useTransport'] as const)(
		'throws when %s is registered twice at runtime',
		(method) => {
			expect(() =>
				createApp((app) => {
					const callback = () => undefined;
					const value = method === 'useTransport' ? {} : callback;
					(app[method] as (input: never) => unknown)(value as never);
					(app as unknown as Record<typeof method, (input: never) => unknown>)[method](value as never);
					return app;
				})
			).toThrow(`[createApp] '${method}' can be registered only once.`);
		}
	);

	it('logs internal errors and can use request fetch collector', async () => {
		const requestFetch = vi.fn(() => Promise.resolve(new Response('ok')));
		const context = {
			...createServerContext(),
			event: {
				...createServerContext().event,
				fetch: requestFetch
			}
		};
		RequestContext.init(() => context as never);

		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const onError = vi.fn();
		const error = new AzureNetKitInternalError('boom');

		const task = useLogger(error, {
			includeOnly: [LoggerErrors.AzureNetKitInternal],
			collector: {
				request: () => new Request('https://example.com/loki', { method: 'POST' }),
				onError
			}
		});

		expect(task).toBeInstanceOf(BackgroundTask);
		await task;

		expect(log).toHaveBeenCalledWith('[Logger][AzureNetInternalError] boom');
		expect(requestFetch).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();

		log.mockRestore();
	});

	it('does not reject when logger collector request creation fails', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const onError = vi.fn();
		const collectorError = new Error('collector failed');

		const task = useLogger(new Error('boom'), {
			collector: {
				request: () => {
					throw collectorError;
				},
				onError
			}
		});

		await expect(task).resolves.toBeUndefined();
		expect(onError).toHaveBeenCalledWith(collectorError);
		log.mockRestore();
	});

	it('allows the logger task to be registered in a runtime waitUntil hook', async () => {
		const context = createServerContext();
		const requestFetch = vi.fn(() => Promise.resolve(new Response('ok')));
		context.event.fetch = requestFetch;
		RequestContext.init(() => context as never);
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();

		const task = useLogger(new Error('boom'), {
			collector: {
				request: () => new Request('https://example.com/loki', { method: 'POST' })
			}
		}).waitUntil(waitUntil);

		expect(waitUntil).toHaveBeenCalledTimes(1);
		await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
		await task;
		expect(requestFetch).toHaveBeenCalledTimes(1);
		log.mockRestore();
	});

	it('throws when the same lifecycle callback is registered twice at runtime', () => {
		expect(() =>
			createApp((app) => {
				app.use(() => undefined);
				(app as never as { use: typeof app.use }).use(() => undefined);
				return app;
			})
		).toThrow("[createApp] 'use' can be registered only once.");
	});

	it('executes server middlewares in order and exposes navigation data', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const calls: string[] = [];
		const first: IServerMiddleware = ({ to, from, event, ensureRoute, next }) => {
			calls.push(`first:${to.pathname}:${from?.pathname}:${event === context.event}:${ensureRoute('/dashboard', to.pathname)}`);
			next();
		};
		const second: IServerMiddleware = async ({ next }) => {
			await Promise.resolve();
			calls.push('second');
			next();
		};

		const app = createApp((app) =>
			app.useServer(async ({ useMiddlewares }) => {
				await useMiddlewares([first, second]);
			})
		);

		await app.register.handle({
			event: context.event,
			resolve: () => new Response('ok')
		} as never);

		expect(calls).toEqual(['first:/dashboard:/login:true:true', 'second']);
	});

	it('rejects server request when middleware chain is not continued', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const app = createApp((app) =>
			app.useServer(async ({ useMiddlewares }) => {
				await useMiddlewares([() => undefined]);
			})
		);

		await expect(
			app.register.handle({
				event: context.event,
				resolve: () => new Response('ok')
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});

	it('does not resolve when server middleware blocks the request', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const resolve = vi.fn(() => new Response('ok'));
		const app = createApp((app) =>
			app.useServer(async ({ useMiddlewares }) => {
				await useMiddlewares([() => undefined]);
			})
		);

		await expect(
			app.register.handle({
				event: context.event,
				resolve
			} as never)
		).rejects.toMatchObject({ status: 403 });
		expect(resolve).not.toHaveBeenCalled();
	});

	it('skips server lifecycle on repeated handle call in the same request context but still resolves', async () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const server = vi.fn();
		const resolve = vi.fn(() => new Response('ok'));
		const app = createApp((app) => app.useServer(server));

		await app.register.handle({ event: context.event, resolve } as never);
		await app.register.handle({ event: context.event, resolve } as never);

		expect(server).toHaveBeenCalledTimes(1);
		expect(resolve).toHaveBeenCalledTimes(2);
	});
});
