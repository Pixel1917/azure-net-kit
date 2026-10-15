import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/lib/shared/app/App.js';
import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
const runtime = vi.hoisted(() => ({
	browser: false,
	snapshot: undefined as App.RequestContextState | undefined,
	hydrate: vi.fn(),
	navigate: vi.fn()
}));
vi.mock('../src/lib/external/tools/index.js', async (importOriginal) => ({
	...(await importOriginal<object>()),
	get BROWSER() {
		return runtime.browser;
	}
}));
vi.mock('$app/navigation', () => ({ beforeNavigate: runtime.navigate, goto: vi.fn() }));
vi.mock('svelte', async (importOriginal) => ({
	...(await importOriginal<object>()),
	hydratable: (key: string, callback: () => App.RequestContextState) => {
		runtime.hydrate(key);
		return runtime.browser && runtime.snapshot ? runtime.snapshot : callback();
	}
}));
beforeEach(() => {
	runtime.browser = false;
	runtime.snapshot = undefined;
	runtime.hydrate.mockClear();
	runtime.navigate.mockClear();
});
describe('useBoot', () => {
	it('runs after awaited server preparation and once per request', async () => {
		let context = { event: {} as never, state: {} as App.RequestContextState };
		initializeRequestContext(() => context);
		const boot = vi.fn(({ state }: { state: App.RequestContextState }): undefined => {
			expect(state.testId).toBe('ready');
		});
		const app = createApp((app) =>
			app.useBoot(boot).useServer(async () => {
				await Promise.resolve();
				context.state.testId = 'ready';
			})
		);
		const resolve = () => {
			app.register();
			app.register();
			return new Response('ok');
		};
		await app.register.handle({ event: context.event, resolve } as never);
		expect(boot).toHaveBeenCalledTimes(1);
		context = { event: {} as never, state: {} };
		await app.register.handle({ event: context.event, resolve } as never);
		expect(boot).toHaveBeenCalledTimes(2);
		expect(runtime.hydrate).toHaveBeenCalledTimes(2);
	});
	it('hydrates before client callbacks, only once, without server context access', () => {
		runtime.browser = true;
		runtime.snapshot = { testId: 'ssr' };
		const getter = vi.fn(() => {
			throw new Error('No server access');
		});
		initializeRequestContext(getter);
		const order: string[] = [];
		const app = createApp((app) =>
			app
				.useBoot(({ state }) => {
					order.push(state.testId!);
				})
				.useClient(() => {
					order.push('client');
				})
		);
		app.register();
		app.register();
		expect(order).toEqual(['ssr', 'client']);
		expect(runtime.hydrate).toHaveBeenCalledTimes(1);
		expect(getter).not.toHaveBeenCalled();
	});
	it('uses an empty state for CSR and never boots in clientInit', async () => {
		runtime.browser = true;
		const boot = vi.fn();
		const app = createApp((app) => app.useBoot(boot));
		await app.register.clientInit();
		expect(boot).not.toHaveBeenCalled();
		app.register();
		expect(boot).toHaveBeenCalledExactlyOnceWith({ state: {} });
	});
	it('rejects async boot and duplicate registrations', () => {
		runtime.browser = true;
		const app = createApp((app) => app.useBoot((async () => {}) as never));
		expect(() => app.register()).toThrow('useBoot must be synchronous');
		expect(() =>
			createApp((app) => {
				app.useBoot(() => {});
				app.useBoot(() => {});
			})
		).toThrow('only once');
	});
});
