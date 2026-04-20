import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@azure-net/edges/context';
import { cleanupProvider, createBoundaryProvider } from '../src/lib/core/shared/boundaryProvider/Provider.js';

describe('createBoundaryProvider', () => {
	let context: { event: unknown; data: unknown };

	beforeEach(() => {
		context = {
			event: {} as never,
			data: {} as never
		};
		RequestContext.init(() => context as never);
	});

	it('creates and caches service instances per request context', () => {
		let constructCount = 0;
		const AppProvider = createBoundaryProvider('AppProviderTest', {
			register: () => ({
				svc: () => ({ id: ++constructCount })
			})
		});

		const first = AppProvider().svc as { id: number };
		const second = AppProvider().svc as { id: number };

		expect(first.id).toBe(1);
		expect(second.id).toBe(1);
	});

	it('throws for missing service key', () => {
		const AppProvider = createBoundaryProvider('MissingServiceProvider', {
			register: () => ({
				svc: () => ({ ok: true })
			})
		});

		expect(() => (AppProvider() as Record<string, unknown>).unknown).toThrow("Service 'unknown' not found in provider 'MissingServiceProvider'");
	});

	it('throws when service factory returns Promise', () => {
		const AppProvider = createBoundaryProvider('PromiseServiceProvider', {
			register: () => ({
				svc: () => Promise.resolve({ ok: true })
			})
		});

		expect(() => AppProvider().svc).toThrow("Service 'svc' in provider 'PromiseServiceProvider' returned Promise.");
	});

	it('runs boot only once per provider in same request context', () => {
		const boot = vi.fn();
		const AppProvider = createBoundaryProvider('BootProvider', {
			register: () => ({
				svc: () => ({ ok: true })
			}),
			boot
		});

		AppProvider();
		AppProvider();

		expect(boot).toHaveBeenCalledTimes(1);
	});

	it('cleanupProvider calls dispose on cached services', async () => {
		const dispose = vi.fn(async () => undefined);
		const AppProvider = createBoundaryProvider('CleanupProvider', {
			register: () => ({
				svc: () => ({ dispose })
			})
		});

		void AppProvider().svc;
		cleanupProvider('CleanupProvider');

		await Promise.resolve();
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});
