import { performance } from 'node:perf_hooks';
import { RequestContext } from '@azure-net/edges/context';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/lib/shared/app/index.js';
import type { IServerMiddleware } from '../src/lib/shared/app/index.js';

const createServerContext = () => ({
	data: {},
	event: {
		fetch,
		url: new URL('https://example.com/dashboard'),
		request: new Request('https://example.com/dashboard')
	}
});

const measure = (label: string, iterations: number, callback: () => void) => {
	const startedAt = performance.now();
	for (let index = 0; index < iterations; index += 1) {
		callback();
	}
	const duration = performance.now() - startedAt;
	const avg = duration / iterations;
	console.info(`[createApp perf] ${label}: ${duration.toFixed(3)}ms total, ${avg.toFixed(6)}ms/op, ${iterations} iterations`);
	return { duration, avg };
};

const measureAsync = async (label: string, iterations: number, callback: () => Promise<void>) => {
	const startedAt = performance.now();
	for (let index = 0; index < iterations; index += 1) {
		await callback();
	}
	const duration = performance.now() - startedAt;
	const avg = duration / iterations;
	console.info(`[createApp perf] ${label}: ${duration.toFixed(3)}ms total, ${avg.toFixed(6)}ms/op, ${iterations} iterations`);
	return { duration, avg };
};

describe('createApp performance', () => {
	it('creates empty app instances with tiny overhead', () => {
		const result = measure('create empty app', 20_000, () => {
			createApp((app) => app);
		});

		expect(result.avg).toBeLessThan(0.05);
	});

	it('creates app instances with registered dependencies cheaply', () => {
		const result = measure('create app with 10 deps', 10_000, () => {
			createApp((app) =>
				app.dependencies({
					A: () => 1,
					B: () => 2,
					C: () => 3,
					D: () => 4,
					E: () => 5,
					F: () => 6,
					G: () => 7,
					H: () => 8,
					I: () => 9,
					J: () => 10
				})
			);
		});

		expect(result.avg).toBeLessThan(0.08);
	});

	it('resolves first dependency and cached dependency reads quickly', () => {
		const context = createServerContext();
		RequestContext.init(() => context as never);

		const { Container } = createApp((app) =>
			app.dependencies({
				Service: () => ({ value: 42 })
			})
		);

		const firstRead = measure('first dependency read', 10_000, () => {
			context.data = {};
			void Container.Service.value;
		});

		const cachedRead = measure('cached dependency read', 200_000, () => {
			void Container.Service.value;
		});

		expect(firstRead.avg).toBeLessThan(0.05);
		expect(cachedRead.avg).toBeLessThan(0.01);
	});

	it('runs handle baseline and lifecycle path with low sync overhead', async () => {
		let context = createServerContext();
		RequestContext.init(() => context as never);

		const baseline = createApp((app) => app);
		const resolve = () => new Response('ok');

		const baselineResult = await measureAsync('handle baseline', 5_000, async () => {
			context = createServerContext();
			await baseline.register.handle({ event: context.event, resolve } as never);
		});

		const lifecycle = createApp((app) => app.use(() => undefined).useServer(() => undefined));

		const lifecycleResult = await measureAsync('handle with universal + server callbacks', 5_000, async () => {
			context = createServerContext();
			await lifecycle.register.handle({ event: context.event, resolve } as never);
		});

		expect(baselineResult.avg).toBeLessThan(0.15);
		expect(lifecycleResult.avg).toBeLessThan(0.18);
	});

	it('runs server middleware chain with low overhead', async () => {
		let context = createServerContext();
		RequestContext.init(() => context as never);

		const middleware: IServerMiddleware = ({ next }) => next();
		const middlewares = [middleware, middleware, middleware, middleware, middleware];
		const app = createApp((app) =>
			app.useServer(async ({ useMiddlewares }) => {
				await useMiddlewares(middlewares);
			})
		);

		const result = await measureAsync('handle with 5 server middlewares', 3_000, async () => {
			context = createServerContext();
			await app.register.handle({
				event: context.event,
				resolve: () => new Response('ok')
			} as never);
		});

		expect(result.avg).toBeLessThan(0.3);
	});
});
