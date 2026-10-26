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
		const usePresenter = RegisterProvider(() => new ReactivePresenter(), { lifecycle: 'singleton' });
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
			const usePresenter = RegisterProvider(factory, { lifecycle: lifecycle });
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
			const usePresenter = RegisterProvider(() => ({}), { lifecycle: lifecycle });
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
		const usePresenter = RegisterProvider(() => ({}), { lifecycle: 'singleton' });
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
		const first = RegisterProvider(() => new Presenter(), { lifecycle: 'singleton' });
		const second = RegisterProvider(() => new Presenter(), { lifecycle: 'singleton' });
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
		expect(() => RegisterProvider(() => ({}), { lifecycle: 'global' as ProviderLifecycle })).toThrow('Unknown lifecycle');
		const usePresenter = RegisterProvider(() => null as never, { lifecycle: 'transient' });
		expect(usePresenter).toThrow('Factory must return an instance');
	});

	it('rejects async factories without an unhandled rejection', async () => {
		const usePresenter = RegisterProvider(
			// @ts-expect-error Async factories are intentionally forbidden.
			async () => {
				throw new Error('async failure');
			},
			{ lifecycle: 'transient' }
		);
		expect(usePresenter).toThrow('Factory must be synchronous');
		await Promise.resolve();
	});
});

describe('RegisterProvider method binding', () => {
	it('does not inspect or change methods when disabled', () => {
		const instance = Object.freeze({
			run() {
				return this;
			},
			get state() {
				throw new Error('getter called');
			}
		});
		for (const options of [{ lifecycle: 'transient' as const }, { lifecycle: 'transient' as const, bindMethods: false }]) {
			const provider = RegisterProvider(() => instance, options);
			expect(provider()).toBe(instance);
			expect(provider().run).toBe(instance.run);
		}
	});
	it('binds after construction, preserves identity and private fields, and skips accessors', async () => {
		const getter = vi.fn(() => {
			throw new Error('getter called');
		});
		class Base {
			base() {
				return this;
			}
			replaced() {
				return 'base';
			}
		}
		const symbol = Symbol('method');
		class Presenter extends Base {
			#value = 3;
			initialized: boolean;
			constructor() {
				super();
				this.initialized = !Object.hasOwn(this, 'read');
			}
			get state() {
				return getter();
			}
			get callback() {
				return getter();
			}
			read() {
				return this.#value;
			}
			override replaced() {
				return super.replaced() + this.read();
			}
			[symbol]() {
				return this.#value;
			}
			async asyncRead() {
				return this.#value;
			}
		}
		const instance = new Presenter();
		const provider = RegisterProvider(() => instance, { lifecycle: 'transient', bindMethods: true });
		expect(provider()).toBe(instance);
		expect(instance.initialized).toBe(true);
		expect(instance).toBeInstanceOf(Presenter);
		const { read, replaced, base, asyncRead, [symbol]: symbolic } = instance;
		expect(read()).toBe(3);
		expect(symbolic()).toBe(3);
		expect(replaced()).toBe('base3');
		expect(base()).toBe(instance);
		await expect(asyncRead()).resolves.toBe(3);
		expect(instance.read).toBe(read);
		expect(getter).not.toHaveBeenCalled();
		expect(Object.hasOwn(instance, 'state')).toBe(false);
		expect(Object.hasOwn(instance, 'constructor')).toBe(false);
		expect(Object.getOwnPropertyDescriptor(instance, 'read')?.enumerable).toBe(false);
	});
	it('binds only selected methods and snapshots the options', () => {
		class Presenter {
			value = 1;
			read() {
				return this.value;
			}
			other() {
				return this.value;
			}
		}
		const methods: ('read' | 'other')[] = ['read', 'read'];
		const provider = RegisterProvider(() => new Presenter(), { bindMethods: methods });
		methods.push('other');
		storage.run(context(), () => {
			const instance = provider();
			const { read } = instance;
			expect(read()).toBe(1);
			expect(instance.other).toBe(Presenter.prototype.other);
			expect(provider()).toBe(instance);
		});
	});
	it('does not bind a shadowed base method or evaluate a selected accessor', () => {
		class Base {
			read() {
				return this;
			}
		}
		const getter = vi.fn(() => () => 1);
		const instance = new Base();
		Object.defineProperty(instance, 'read', { get: getter, configurable: true });
		const all = RegisterProvider(() => instance, { lifecycle: 'transient', bindMethods: true });
		expect(all()).toBe(instance);
		expect(getter).not.toHaveBeenCalled();
		const selected = RegisterProvider(() => instance, { lifecycle: 'transient', bindMethods: ['read'] });
		expect(selected).toThrow('non-method');
		expect(getter).not.toHaveBeenCalled();
	});
	it('fails before modifying any method on protected instances or invalid selections', () => {
		class Presenter {
			first() {
				return this;
			}
			second() {
				return this;
			}
		}
		const instance = new Presenter();
		Object.defineProperty(instance, 'second', { value: instance.second, configurable: false, writable: false });
		expect(RegisterProvider(() => instance, { lifecycle: 'transient', bindMethods: true })).toThrow('protected method');
		expect(Object.hasOwn(instance, 'first')).toBe(false);
		expect(RegisterProvider(() => Object.freeze(new Presenter()), { lifecycle: 'transient', bindMethods: true })).toThrow('protected method');
		expect(RegisterProvider(() => new Presenter(), { lifecycle: 'transient', bindMethods: ['missing'] as never })).toThrow('not found');
	});
	it('isolates bound methods across concurrent requests and browser singletons', async () => {
		class Presenter {
			id = RequestContext.current().state.testId;
			read() {
				return this.id;
			}
		}
		const provider = RegisterProvider(() => new Presenter(), { lifecycle: 'singleton', bindMethods: true });
		const values = await Promise.all(
			Array.from({ length: 50 }, (_, i) =>
				storage.run(context(String(i)), async () => {
					const { read } = provider();
					await Promise.resolve();
					expect(provider().read).toBe(read);
					return read();
				})
			)
		);
		expect(values).toEqual(Array.from({ length: 50 }, (_, i) => String(i)));
		environment.browser = true;
		class Client {
			read() {
				return this;
			}
		}
		const client = RegisterProvider(() => new Client(), { lifecycle: 'singleton', bindMethods: true });
		const { read } = client();
		expect(read()).toBe(client());
	});
});

it('binds rune class methods without replacing reactive accessors', () => {
	environment.browser = true;
	const instance = new ReactivePresenter();
	const before = Object.getOwnPropertyDescriptor(ReactivePresenter.prototype, 'count');
	const hadOwnCount = Object.hasOwn(instance, 'count');
	const provider = RegisterProvider(() => instance, { bindMethods: true });
	const { add } = provider();
	add(2);
	expect(instance.count).toBe(2);
	expect(instance.doubled).toBe(4);
	expect(Object.hasOwn(instance, 'count')).toBe(hadOwnCount);
	expect(Object.hasOwn(instance, 'doubled')).toBe(false);
	expect(Object.getOwnPropertyDescriptor(ReactivePresenter.prototype, 'count')).toEqual(before);
});
