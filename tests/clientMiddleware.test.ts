import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ goto: vi.fn(), page: { url: new URL('https://example.com/current') } }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$app/state', () => ({ page: mocks.page }));
import { executeClientMiddlewares, type IClientMiddleware, type ClientMiddlewareContext } from '../src/lib/shared/app/middleware/ClientMiddleware.js';
const createNavigation = () => ({
	from: { url: new URL('https://example.com/from') },
	to: { url: new URL('https://example.com/to') },
	shallow: true,
	cancel: vi.fn()
});
const wrap = (execute: IClientMiddleware['execute']) =>
	class implements IClientMiddleware {
		execute = execute;
	};

describe('executeClientMiddlewares', () => {
	beforeEach(() => {
		mocks.goto.mockReset();
		mocks.goto.mockResolvedValue(undefined);
	});
	it('stops without constructing later middlewares', () => {
		const navigation = createNavigation();
		const constructed = vi.fn();
		class Second {
			constructor() {
				constructed();
			}
			execute() {
				return undefined;
			}
		}
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		executeClientMiddlewares([wrap(() => undefined), Second], navigation as never);
		expect(navigation.cancel).toHaveBeenCalledOnce();
		expect(constructed).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
		warning.mockRestore();
	});
	it('runs in order with a fresh instance on each navigation', () => {
		const calls: string[] = [];
		class First implements IClientMiddleware {
			count = 0;
			execute({ next, navigation, to, from, ensureRoute }: ClientMiddlewareContext) {
				calls.push(`first:${++this.count}`);
				expect(navigation?.shallow).toBe(true);
				expect(ensureRoute('/to', to.pathname)).toBe(true);
				expect(from?.pathname).toBe('/from');
				return next();
			}
		}
		const Second = wrap(({ next }) => {
			calls.push('second');
			return next();
		});
		const navigation = createNavigation();
		executeClientMiddlewares([First, Second], navigation as never);
		executeClientMiddlewares([First, Second], navigation as never);
		expect(calls).toEqual(['first:1', 'second', 'first:1', 'second']);
		expect(navigation.cancel).not.toHaveBeenCalled();
	});
	it('cancels and redirects with native Kit 3 goto options', () => {
		const navigation = createNavigation();
		const second = vi.fn(({ next }: ClientMiddlewareContext) => next());
		const options = { replace: true, reset: false, refreshAll: true, state: {} };
		executeClientMiddlewares([wrap(({ next }) => next('/login', options)), wrap(second)], navigation as never);
		expect(navigation.cancel).toHaveBeenCalledOnce();
		expect(mocks.goto).toHaveBeenCalledWith('/login', options);
		expect(second).not.toHaveBeenCalled();
	});
	it('rejects async middleware at runtime even when JS bypasses types', async () => {
		const navigation = createNavigation();
		class Async {
			async execute({ next }: ClientMiddlewareContext) {
				await Promise.resolve();
				next();
			}
		}
		expect(() => executeClientMiddlewares([Async as never], navigation as never)).toThrow('must be synchronous');
		expect(navigation.cancel).toHaveBeenCalledOnce();
		await Promise.resolve();
		expect(mocks.goto).not.toHaveBeenCalled();
	});
	it('blocks thrown errors, repeated next, and rejected redirects without unhandled rejections', async () => {
		const navigation = createNavigation();
		expect(() =>
			executeClientMiddlewares(
				[
					wrap(({ next }) => {
						next();
						return next('/again');
					})
				],
				navigation as never
			)
		).toThrow('only once');
		expect(navigation.cancel).toHaveBeenCalledOnce();
		const error = new Error('no route');
		mocks.goto.mockRejectedValue(error);
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		executeClientMiddlewares([wrap(({ next }) => next('/missing'))], createNavigation() as never);
		await Promise.resolve();
		expect(log).toHaveBeenCalledWith('[Middleware] Redirect failed:', error);
		log.mockRestore();
	});
});
