import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it, vi } from 'vitest';
import { initializeRequestContext, type ContextData } from '../src/lib/shared/request-context/Internal.js';
import { executeServerMiddlewares, type IServerMiddleware, type ServerMiddlewareContext } from '../src/lib/shared/app/middleware/ServerMiddleware.js';
const makeContext = (path = '/', referer = '') =>
	({
		state: {},
		event: { url: new URL(`https://example.com${path}`), request: new Request(`https://example.com${path}`, { headers: { referer } }) }
	}) as ContextData;

describe('server middleware classes', () => {
	it('creates instances per request with sequential async execution', async () => {
		const storage = new AsyncLocalStorage<ContextData>();
		initializeRequestContext(() => storage.getStore());
		const seen = new Map<string, number[]>();
		class First implements IServerMiddleware {
			count = 0;
			async execute({ next, to }: ServerMiddlewareContext) {
				this.count++;
				await Promise.resolve();
				seen.set(to.pathname, [this.count]);
				next();
			}
		}
		class Second implements IServerMiddleware {
			execute({ next, to }: ServerMiddlewareContext) {
				seen.get(to.pathname)!.push(2);
				next();
			}
		}
		await Promise.all(
			Array.from({ length: 25 }, (_, index) => storage.run(makeContext(`/${index}`), () => executeServerMiddlewares([First, Second])))
		);
		expect(seen.size).toBe(25);
		for (const values of seen.values()) expect(values).toEqual([1, 2]);
	});
	it('does not instantiate remaining middleware after redirect or failure', async () => {
		initializeRequestContext(() => makeContext());
		const constructor = vi.fn();
		class Last {
			constructor() {
				constructor();
			}
			execute() {}
		}
		class Redirect {
			execute({ next }: ServerMiddlewareContext) {
				next('/login', 303);
			}
		}
		class Block {
			execute() {}
		}
		class Fail {
			execute() {
				throw new Error('failure');
			}
		}
		await expect(executeServerMiddlewares([Redirect, Last])).rejects.toMatchObject({ status: 303, location: '/login' });
		await expect(executeServerMiddlewares([Block, Last])).rejects.toMatchObject({ status: 403 });
		await expect(executeServerMiddlewares([Fail, Last])).rejects.toThrow('failure');
		expect(constructor).not.toHaveBeenCalled();
	});
	it('ignores malformed referer headers without failing the request', async () => {
		initializeRequestContext(() => makeContext('/', 'not a valid URL'));
		class Read implements IServerMiddleware {
			execute({ from, event, next }: ServerMiddlewareContext) {
				expect(from).toBeUndefined();
				expect(event.url.pathname).toBe('/');
				next();
			}
		}
		await executeServerMiddlewares([Read]);
	});
});
