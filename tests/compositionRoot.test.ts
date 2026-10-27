import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it, vi } from 'vitest';
import { CompositionRoot } from '../src/lib/shared/boundary-provider/CompositionRoot.js';
import { CreateServiceContainer, cleanupProvider } from '../src/lib/shared/boundary-provider/Provider.js';
import { initializeRequestContext, type ContextData } from '../src/lib/shared/request-context/Internal.js';

describe('CompositionRoot', () => {
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
		const container = root.resolveContainer();
		expect(factory).not.toHaveBeenCalled();
		expect(container.account.count).toBe(3);
		expect(container.account.datasource.id).toBe(42);
		expect(root.resolveContainer()).toBe(container);
		expect(root.resolveContainer().account).toBe(container.account);
		expect(factory).toHaveBeenCalledTimes(1);
		context = { event: {}, state: {} } as ContextData;
		expect(root.resolveContainer().account).not.toBe(container.account);
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
					const value = first.resolveContainer().value;
					await Promise.resolve();
					expect(first.resolveContainer().value).toBe(value);
					expect(second.resolveContainer().value).not.toBe(value);
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
		const first = root.resolveContainer().value;
		expect(root.resolveContainer().value).toBe(first);
		expect(boot).toHaveBeenCalledTimes(1);
		await cleanupProvider(root.name);
		expect(dispose).toHaveBeenCalledOnce();
		expect(root.resolveContainer().value).not.toBe(first);
		expect(boot).toHaveBeenCalledTimes(2);
	});
});
