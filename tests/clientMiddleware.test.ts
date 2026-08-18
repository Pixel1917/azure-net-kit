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

	it('stops the chain immediately when a middleware does not call next', () => {
		const navigation = createNavigation();
		const second = vi.fn(({ next }) => next());
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		executeClientMiddlewares([() => undefined, second], navigation as never);

		expect(navigation.cancel).toHaveBeenCalledOnce();
		expect(second).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
		expect(warning).toHaveBeenCalledOnce();
		warning.mockRestore();
	});

	it('continues synchronously through middlewares that call next', () => {
		const navigation = createNavigation();
		const calls: string[] = [];
		const middlewares: IClientMiddleware[] = [
			({ next }) => {
				calls.push('first');
				next();
			},
			({ next }) => {
				calls.push('second');
				next();
			}
		];

		executeClientMiddlewares(middlewares, navigation as never);

		expect(calls).toEqual(['first', 'second']);
		expect(navigation.cancel).not.toHaveBeenCalled();
	});

	it('cancels synchronously and redirects once without running later middlewares', () => {
		const navigation = createNavigation();
		const second = vi.fn(({ next }) => next());

		executeClientMiddlewares([({ next }) => next('/login'), second], navigation as never);

		expect(navigation.cancel).toHaveBeenCalledOnce();
		expect(mocks.goto).toHaveBeenCalledWith('/login');
		expect(second).not.toHaveBeenCalled();
	});
});
