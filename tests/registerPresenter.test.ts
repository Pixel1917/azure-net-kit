declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace App {
		interface RequestContextState {
			testId?: string;
		}
	}
}
import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext, type ContextData } from '../src/lib/shared/request-context/Internal.js';
import { RegisterProvider, type ProviderLifecycle } from '../src/lib/delivery/presenter/RegisterProvider.js';
import { ReactivePresenter } from './fixtures/ReactivePresenter.svelte.js';

const environment = vi.hoisted(() => ({ browser: false }));
vi.mock('../src/lib/external/tools/index.js', () => ({
	get BROWSER() {
		return environment.browser;
	}
}));

const storage = new AsyncLocalStorage<ContextData>();
const context = (id = 'test'): ContextData => ({ state: { testId: id }, event: {} as never });

beforeEach(() => {
	environment.browser = false;
	initializeRequestContext(() => {
		const current = storage.getStore();
		if (!current) throw new Error('No request');
		return current;
	});
});

describe('RegisterProvider', () => {
	it('does not proxy or replace reactive class instances', () => {
		const usePresenter = RegisterProvider(() => new ReactivePresenter(), 'singleton');
		const server = storage.run(context(), () => {
			const value = usePresenter();
			const { increment } = value;
			increment();
			expect(usePresenter().count).toBe(1);
			return value;
		});
		expect(storage.run(context(), usePresenter).count).toBe(0);
		environment.browser = true;
		const client = usePresenter();
		expect(client).toBeInstanceOf(ReactivePresenter);
		expect(client).not.toBe(server);
		client.increment();
		expect(usePresenter().count).toBe(1);
	});
	it('registers lazily at module scope and fails closed without a server request', () => {
		const factory = vi.fn(() => ({}));
		const usePresenter = RegisterProvider(factory);
		expect(factory).not.toHaveBeenCalled();
		expect(usePresenter).toThrow('No request');
		expect(factory).not.toHaveBeenCalled();
	});

	for (const lifecycle of ['scoped', 'singleton'] as const) {
		it(`${lifecycle}: reuses within a request and isolates 100 interleaved requests`, async () => {
			class Presenter {
				id = RequestContext.current().state.testId;
				count = 0;
				increment() {
					return ++this.count;
				}
			}
			const factory = vi.fn(() => new Presenter());
			const usePresenter = RegisterProvider(factory, lifecycle);
			const instances = await Promise.all(
				Array.from({ length: 100 }, (_, index) =>
					storage.run(context(String(index)), async () => {
						const presenter = usePresenter();
						presenter.increment();
						await new Promise((resolve) => setTimeout(resolve, index % 3));
						expect(usePresenter()).toBe(presenter);
						expect(presenter.id).toBe(String(index));
						expect(presenter.count).toBe(1);
						return presenter;
					})
				)
			);
			expect(new Set(instances).size).toBe(100);
			expect(factory).toHaveBeenCalledTimes(100);
		});
	}

	for (const lifecycle of ['transient'] as const) {
		it(`${lifecycle}: never caches, on either side`, () => {
			const usePresenter = RegisterProvider(() => ({}), lifecycle);
			expect(usePresenter()).not.toBe(usePresenter());
			storage.run(context(), () => expect(usePresenter()).not.toBe(usePresenter()));
			environment.browser = true;
			expect(usePresenter()).not.toBe(usePresenter());
		});
	}

	it('scoped creates a fresh client instance, including the default lifecycle', () => {
		environment.browser = true;
		const usePresenter = RegisterProvider(() => ({}));
		expect(usePresenter()).not.toBe(usePresenter());
	});

	it('singleton is shared in the browser, never with server requests', () => {
		const usePresenter = RegisterProvider(() => ({}), 'singleton');
		const server = storage.run(context(), usePresenter);
		environment.browser = true;
		const client = usePresenter();
		expect(usePresenter()).toBe(client);
		expect(client).not.toBe(server);
		environment.browser = false;
		expect(storage.run(context(), usePresenter)).not.toBe(client);
	});

	it('independent registrations of the same class do not collide', () => {
		class Presenter {}
		const first = RegisterProvider(() => new Presenter(), 'singleton');
		const second = RegisterProvider(() => new Presenter(), 'singleton');
		storage.run(context(), () => expect(first()).not.toBe(second()));
		environment.browser = true;
		expect(first()).not.toBe(second());
	});

	it('does not cache failed construction', () => {
		const failure = new Error('construction failed');
		const factory = vi
			.fn<() => object>()
			.mockImplementationOnce(() => {
				throw failure;
			})
			.mockReturnValue({});
		const usePresenter = RegisterProvider(factory);
		storage.run(context(), () => {
			expect(usePresenter).toThrow(failure);
			expect(usePresenter()).toBe(usePresenter());
		});
		expect(factory).toHaveBeenCalledTimes(2);
	});

	it('guards recursive graphs and resets the guard after a failure', () => {
		let recursive = true;
		const first: () => object = RegisterProvider<object>(() => (recursive ? second() : {}));
		const second: () => object = RegisterProvider<object>(() => first());
		storage.run(context(), () => {
			expect(first).toThrow('Circular presenter dependency');
			recursive = false;
			expect(first()).toEqual({});
		});
	});

	it('rejects invalid lifecycles and invalid factory results', () => {
		expect(() => RegisterProvider(() => ({}), 'global' as ProviderLifecycle)).toThrow('Unknown lifecycle');
		const usePresenter = RegisterProvider(() => null as never, 'transient');
		expect(usePresenter).toThrow('Factory must return an instance');
	});

	it('rejects async factories without an unhandled rejection', async () => {
		// @ts-expect-error Async factories are intentionally forbidden.
		const usePresenter = RegisterProvider(async () => {
			throw new Error('async failure');
		}, 'transient');
		expect(usePresenter).toThrow('Factory must be synchronous');
		await Promise.resolve();
	});
});
