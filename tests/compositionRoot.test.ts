import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it, vi } from 'vitest';
import { CompositionRoot } from '../src/lib/shared/boundary-provider/CompositionRoot.js';
import { CreateServiceContainer, cleanupProvider } from '../src/lib/shared/boundary-provider/Provider.js';
import { initializeRequestContext, type ContextData } from '../src/lib/shared/request-context/Internal.js';

describe('CompositionRoot', () => {
	it('uses unique symbols and does not confuse equally named services across roots', () => {
		const context = { event: {}, state: {} } as ContextData;
		initializeRequestContext(() => context);
		const first = new CompositionRoot({ register: () => ({ value: () => 42 }) });
		const second = new CompositionRoot({
			dependsOn: { first },
			register: ({ first }) => ({ value: () => first.value + 1 })
		});
		expect(typeof first.name).toBe('symbol');
		expect(first.name).not.toBe(second.name);
		expect(first.name.description).toBe(second.name.description);
		expect(second.resolve().value).toBe(43);
	});

	it('detects real symbol-keyed cycles and retains readable diagnostics', () => {
		const context = { event: {}, state: {} } as ContextData;
		initializeRequestContext(() => context);
		const root = new CompositionRoot<{ value: () => number }>({
			register: () => ({ value: (): number => root.resolve().value })
		});
		expect(() => root.resolve().value).toThrow('Circular provider dependency detected');
		expect(() => root.resolve().value).toThrow('Symbol(@azure-net/kit:CompositionRoot).value');
	});

	it('cleans symbol-keyed services even when dispose fails', async () => {
		const context = { event: {}, state: {} } as ContextData;
		initializeRequestContext(() => context);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const root = new CompositionRoot({
				register: () => ({
					value: () => ({
						dispose() {
							throw new Error('dispose failed');
						}
					})
				})
			});
			const value = root.resolve().value;
			await expect(cleanupProvider(root.name)).resolves.toBeUndefined();
			expect(log).toHaveBeenCalledOnce();
			expect(root.resolve().value).not.toBe(value);
		} finally {
			log.mockRestore();
		}
	});

	it('is lazy, accepts roots and existing containers, and preserves service caching', () => {
		let context = { event: {}, state: {} } as ContextData;
		initializeRequestContext(() => context);
		const factory = vi.fn(() => ({ id: 42 }));
		const http = new CompositionRoot({ register: () => ({ datasource: factory }) });
		const legacy = CreateServiceContainer('composition-legacy', { register: () => ({ value: () => 3 }) });
		const root = new CompositionRoot({
			dependsOn: { http, legacy },
			register: ({ http, legacy }) => ({
				account: () => ({ datasource: http.datasource, count: legacy.value })
			})
		});
		expect(factory).not.toHaveBeenCalled();
		const container = root.resolve();
		expect(factory).not.toHaveBeenCalled();
		expect(container.account.count).toBe(3);
		expect(container.account.datasource.id).toBe(42);
		expect(root.resolve()).toBe(container);
		expect(root.resolve().account).toBe(container.account);
		expect(factory).toHaveBeenCalledTimes(1);
		context = { event: {}, state: {} } as ContextData;
		expect(root.resolve().account).not.toBe(container.account);
		expect(factory).toHaveBeenCalledTimes(2);
	});

	it('does not require an active request during module-level construction', () => {
		initializeRequestContext(() => undefined);
		expect(() => new CompositionRoot({ register: () => ({ value: () => 1 }) })).not.toThrow();
	});

	it('isolates concurrent requests and does not collide with other roots', async () => {
		const storage = new AsyncLocalStorage<ContextData>();
		initializeRequestContext(() => storage.getStore());
		const first = new CompositionRoot({ register: () => ({ value: () => ({}) }) });
		const second = new CompositionRoot({ register: () => ({ value: () => ({}) }) });
		const values = await Promise.all(
			Array.from({ length: 40 }, () =>
				storage.run({ event: {}, state: {} } as ContextData, async () => {
					const value = first.resolve().value;
					await Promise.resolve();
					expect(first.resolve().value).toBe(value);
					expect(second.resolve().value).not.toBe(value);
					return value;
				})
			)
		);
		expect(new Set(values).size).toBe(40);
	});

	it('supports existing cleanup and boot without wrapping resolved instances', async () => {
		initializeRequestContext(() => context);
		const context = { event: {}, state: {} } as ContextData;
		const dispose = vi.fn();
		const boot = vi.fn();
		const root = new CompositionRoot({ register: () => ({ value: () => ({ dispose }) }), boot });
		const first = root.resolve().value;
		expect(root.resolve().value).toBe(first);
		expect(boot).toHaveBeenCalledTimes(1);
		await cleanupProvider(root.name);
		expect(dispose).toHaveBeenCalledOnce();
		expect(root.resolve().value).not.toBe(first);
		expect(boot).toHaveBeenCalledTimes(2);
	});
});
