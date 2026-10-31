import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ browser: true, page: { url: new URL('https://example.com/first') } }));
vi.mock('@azure-net/tools/environment', async (importOriginal) => ({
	...(await importOriginal<typeof import('@azure-net/tools/environment')>()),
	get BROWSER() {
		return mocks.browser;
	}
}));
vi.mock('$app/state', () => ({ page: mocks.page }));
vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
import { ClientMiddlewareManager, type ClientMiddlewareContext } from '../src/lib/shared/app/middleware/ClientMiddleware.js';

describe('ClientMiddlewareManager', () => {
	it('manually runs on the current URL, with fresh instances and no subscriptions', () => {
		const seen: string[] = [];
		class Read {
			calls = 0;
			execute({ to, from, navigation, next }: ClientMiddlewareContext) {
				expect(++this.calls).toBe(1);
				expect(from).toBeUndefined();
				expect(navigation).toBeUndefined();
				seen.push(to.pathname);
				return next();
			}
		}
		const definitions = [Read];
		const manager = new ClientMiddlewareManager(definitions);
		definitions.length = 0;
		manager.execute();
		mocks.page.url = new URL('https://example.com/second');
		manager.execute();
		expect(seen).toEqual(['/first', '/second']);
	});
	it('uses real navigation and cancels when a middleware stops', () => {
		const cancel = vi.fn();
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const manager = new ClientMiddlewareManager([
			class {
				execute({ to }: ClientMiddlewareContext) {
					expect(to.pathname).toBe('/target');
					return undefined;
				}
			}
		]);
		manager.execute({ to: { url: new URL('https://example.com/target') }, cancel } as never);
		expect(cancel).toHaveBeenCalledOnce();
		warning.mockRestore();
	});
	it('does not execute client middleware during SSR', () => {
		const execute = vi.fn();
		mocks.browser = false;
		try {
			new ClientMiddlewareManager([
				class {
					execute = execute;
				}
			]).execute();
		} finally {
			mocks.browser = true;
		}
		expect(execute).not.toHaveBeenCalled();
	});
});
