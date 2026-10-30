import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/lib/shared/app/index.js';
import type { IServerMiddleware } from '../src/lib/shared/app/index.js';
import { createAsyncAction as asyncAction } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';

const createServerContext = () => ({
	state: {},
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

	it('runs handle baseline and lifecycle path with low sync overhead', async () => {
		let context = createServerContext();
		initializeRequestContext(() => context as never);

		const baseline = createApp((app) => app);
		const resolve = () => new Response('ok');

		const baselineResult = await measureAsync('handle baseline', 5_000, async () => {
			context = createServerContext();
			await baseline.register.handle({ event: context.event, resolve } as never);
		});

		const lifecycle = createApp((app) => app.useServer(() => undefined));

		const lifecycleResult = await measureAsync('handle with universal + server callbacks', 5_000, async () => {
			context = createServerContext();
			await lifecycle.register.handle({ event: context.event, resolve } as never);
		});

		expect(baselineResult.avg).toBeLessThan(0.15);
		expect(lifecycleResult.avg).toBeLessThan(0.18);
	});

	it('runs server middleware chain with low overhead', async () => {
		let context = createServerContext();
		initializeRequestContext(() => context as never);

		const middleware: IServerMiddleware['execute'] = ({ next }) => next();
		class Pass implements IServerMiddleware {
			execute = middleware;
		}
		const middlewares = [Pass, Pass, Pass, Pass, Pass];
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

	it('converts default async helper errors with low overhead', async () => {
		const createAsyncAction = asyncAction;
		const error = new Error('expected');
		const result = await measureAsync('default helper error conversion', 5_000, async () => {
			await createAsyncAction(async () => {
				throw error;
			});
		});

		expect(result.avg).toBeLessThan(0.15);
	});
});
