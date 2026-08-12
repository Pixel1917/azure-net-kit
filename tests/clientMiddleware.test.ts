import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	goto: vi.fn(),
	page: { url: new URL('https://example.com/current') }
}));

vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$app/state', () => ({ page: mocks.page }));

import { executeClientMiddlewares, type IClientMiddleware } from '../src/lib/shared/app/middleware/ClientMiddleware.js';

const createNavigation = () => ({
	from: { url: new URL('https://example.com/from') },
	to: { url: new URL('https://example.com/to') },
	cancel: vi.fn()
});

describe('executeClientMiddlewares', () => {
	beforeEach(() => {
		mocks.goto.mockReset();
		mocks.goto.mockResolvedValue(undefined);
	});

	it('stops the chain immediately when a synchronous middleware does not call next', async () => {
		const navigation = createNavigation();
		const second = vi.fn(({ next }) => next());
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const execution = executeClientMiddlewares([() => undefined, second], navigation as never);

		expect(navigation.cancel).toHaveBeenCalledOnce();
		await execution;
		expect(second).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
		expect(warning).toHaveBeenCalledOnce();
		warning.mockRestore();
	});

	it('continues through middlewares that call next', async () => {
		const navigation = createNavigation();
		const calls: string[] = [];
		const middlewares: IClientMiddleware[] = [
			({ next }) => {
				calls.push('first');
				next();
			},
			async ({ next }) => {
				await Promise.resolve();
				calls.push('second');
				next();
			}
		];

		await executeClientMiddlewares(middlewares, navigation as never);

		expect(calls).toEqual(['first', 'second']);
		expect(navigation.cancel).not.toHaveBeenCalled();
	});

	it('cancels and redirects once without running later middlewares', async () => {
		const navigation = createNavigation();
		const second = vi.fn(({ next }) => next());

		await executeClientMiddlewares([({ next }) => next('/login'), second], navigation as never);

		expect(navigation.cancel).toHaveBeenCalledOnce();
		expect(mocks.goto).toHaveBeenCalledWith('/login');
		expect(second).not.toHaveBeenCalled();
	});
});
