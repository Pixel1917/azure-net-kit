import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContext } from '../src/lib/shared/request-context/Internal.js';
import { cleanupProvider, CreateDiContainer } from '../src/lib/shared/boundary-provider/Provider.js';
import type { ProviderWithType } from '../src/lib/shared/boundary-provider/Provider.js';

describe('CreateDiContainer', () => {
	let context: { event: unknown; data: unknown };

	beforeEach(() => {
		context = {
			event: {} as never,
			data: {} as never
		};
		initializeRequestContext(() => context as never);
	});

	it('creates and caches service instances per request context', () => {
		let constructCount = 0;
		const AppProvider = CreateDiContainer('AppProviderTest', {
			register: () => ({
				svc: () => ({ id: ++constructCount })
			})
		});

		const first = AppProvider().svc as { id: number };
		const second = AppProvider().svc as { id: number };

		expect(first.id).toBe(1);
		expect(second.id).toBe(1);
	});

	it('shares proxy and register work only within a request, and resets on cleanup', async () => {
		const register = vi.fn(() => ({ first: () => ({}), second: () => ({}) }));
		const boot = vi.fn();
		const provider = CreateDiContainer('RequestProxyCache', { register, boot });
		const first = provider();
		expect(provider()).toBe(first);
		void first.first;
		void provider().second;
		expect(register).toHaveBeenCalledTimes(1);
		expect(boot).toHaveBeenCalledTimes(1);
		await cleanupProvider('RequestProxyCache');
		expect(provider()).not.toBe(first);
		expect(register).toHaveBeenCalledTimes(2);
		expect(boot).toHaveBeenCalledTimes(2);
		context = { event: {}, data: {} };
		expect(provider()).not.toBe(first);
		expect(register).toHaveBeenCalledTimes(3);
	});

	it('does not cache a proxy after boot fails', () => {
		let fail = true;
		const provider = CreateDiContainer('RetryFailedBoot', {
			register: () => ({ value: () => 1 }),
			boot: () => {
				if (fail) throw new Error('boot failed');
			}
		});
		expect(() => provider()).toThrow('boot failed');
		fail = false;
		expect(provider().value).toBe(1);
	});

	it('isolates proxy and captured register state across overlapping SSR requests', async () => {
		const storage = new AsyncLocalStorage<{ event: { id: number }; data: Record<string, unknown> }>();
		initializeRequestContext(() => storage.getStore() as never);
		let calls = 0;
		const provider = CreateDiContainer('ConcurrentRequests', {
			register: () => {
				calls++;
				const id = storage.getStore()!.event.id;
				return { id: () => id };
			}
		});
		const results = await Promise.all(
			[1, 2, 3].map((id) =>
				storage.run({ event: { id }, data: {} }, async () => {
					const first = provider();
					expect(first.id).toBe(id);
					await new Promise((resolve) => setTimeout(resolve, 4 - id));
					expect(provider()).toBe(first);
					expect(provider().id).toBe(id);
					return first;
				})
			)
		);
		expect(new Set(results).size).toBe(3);
		expect(calls).toBe(3);
	});

	it('throws for missing service key', () => {
		const AppProvider = CreateDiContainer('MissingServiceProvider', {
			register: () => ({
				svc: () => ({ ok: true })
			})
		});

		expect(() => (AppProvider() as Record<string, unknown>).unknown).toThrow("Service 'unknown' not found in provider 'MissingServiceProvider'");
	});

	it('supports object enumeration, serialization and Promise resolution', async () => {
		let constructCount = 0;
		const AppProvider = CreateDiContainer('ObjectInteropProvider', {
			register: () => ({
				svc: () => ({ id: ++constructCount })
			})
		});
		const provider = AppProvider();

		expect(Object.keys(provider)).toEqual(['svc']);
		expect(constructCount).toBe(0);
		expect(JSON.stringify(provider)).toBe('{"svc":{"id":1}}');
		expect(constructCount).toBe(1);
		await expect(Promise.resolve(provider)).resolves.toBe(provider);
		expect(String(provider)).toBe('[object Object]');
		expect(Object.prototype.hasOwnProperty.call(provider, 'svc')).toBe(true);
		expect(Reflect.get(provider, Symbol.toStringTag)).toBeUndefined();
		expect(() => (provider as Record<string, unknown>).unknown).toThrow("Service 'unknown' not found in provider 'ObjectInteropProvider'");
	});

	it('throws when service factory returns Promise', () => {
		const AppProvider = CreateDiContainer('PromiseServiceProvider', {
			register: () => ({
				svc: () => Promise.resolve({ ok: true })
			})
		});

		expect(() => AppProvider().svc).toThrow("Service 'svc' in provider 'PromiseServiceProvider' returned Promise.");
	});

	it('runs boot only once per provider in same request context', () => {
		const boot = vi.fn();
		const AppProvider = CreateDiContainer('BootProvider', {
			register: () => ({
				svc: () => ({ ok: true })
			}),
			boot
		});

		AppProvider();
		AppProvider();

		expect(boot).toHaveBeenCalledTimes(1);
	});

	it('rejects asynchronous boot at runtime', () => {
		const AppProvider = CreateDiContainer('AsyncBootProvider', {
			register: () => ({ svc: () => ({ ok: true }) }),
			boot: (async () => undefined) as never
		});

		expect(() => AppProvider()).toThrow("Boot for provider 'AsyncBootProvider' must be synchronous");
	});

	it('cleanupProvider calls dispose on cached services', async () => {
		const dispose = vi.fn(async () => undefined);
		const AppProvider = CreateDiContainer('CleanupProvider', {
			register: () => ({
				svc: () => ({ dispose })
			})
		});

		void AppProvider().svc;
		await cleanupProvider('CleanupProvider');
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it('cleanupProvider resolves only after asynchronous disposal finishes', async () => {
		let finishDispose!: () => void;
		const dispose = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishDispose = resolve;
				})
		);
		const AppProvider = CreateDiContainer('AwaitCleanupProvider', {
			register: () => ({ svc: () => ({ dispose }) })
		});

		void AppProvider().svc;
		let completed = false;
		const cleanup = cleanupProvider('AwaitCleanupProvider').then(() => {
			completed = true;
		});
		await Promise.resolve();
		expect(completed).toBe(false);

		finishDispose();
		await cleanup;
		expect(completed).toBe(true);
	});

	it('throws a readable error for circular service dependencies', () => {
		type ProviderAType = ProviderWithType<{ svcA: () => { label: string } }>;
		type ProviderBType = ProviderWithType<{ svcB: () => { label: string } }>;
		const providers = {} as { ProviderA: ProviderAType; ProviderB: ProviderBType };
		const getProviderA = (): ReturnType<ProviderAType> => providers.ProviderA();
		const getProviderB = (): ReturnType<ProviderBType> => providers.ProviderB();

		providers.ProviderA = CreateDiContainer('CycleProviderA', {
			register: () => ({
				svcA: () => getProviderB().svcB
			})
		});

		providers.ProviderB = CreateDiContainer('CycleProviderB', {
			register: () => ({
				svcB: () => getProviderA().svcA
			})
		});

		expect(() => providers.ProviderA().svcA).toThrow(
			'[BoundaryProvider] Circular provider dependency detected: CycleProviderA.svcA -> CycleProviderB.svcB -> CycleProviderA.svcA'
		);
	});
});
