import { RequestContext } from '@azure-net/edges/context';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/lib/shared/app/index.js';
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

	it('runs server init only once per app instance', () => {
		const callback = vi.fn();
		const app = createApp((app) => app.useServerInit(callback));

		app.register.serverInit();
		app.register.serverInit();

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
			message: 'Internal error'
		});
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
		const first: IServerMiddleware = ({ to, from, event, next }) => {
			calls.push(`first:${to.pathname}:${from?.pathname}:${event === context.event}`);
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

		expect(calls).toEqual(['first:/dashboard:/login:true', 'second']);
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
