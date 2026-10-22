import { describe, expect, it, vi } from 'vitest';

vi.mock('@azure-net/tools/environment', async (importOriginal) => ({
	...(await importOriginal<typeof import('@azure-net/tools/environment')>()),
	BROWSER: true
}));

import { cleanupProvider, CreateServiceContainer } from '../src/lib/shared/boundary-provider/Provider.js';

describe('CreateDiContainer in browser', () => {
	it('does not share factories between providers that reuse the same register callback', () => {
		const DependencyA = CreateServiceContainer('FactoryIsolationDependencyA', {
			register: () => ({ value: () => 'A' })
		});
		const DependencyB = CreateServiceContainer('FactoryIsolationDependencyB', {
			register: () => ({ value: () => 'B' })
		});
		const register = ({ Dependency }: { Dependency: { value: string } }) => ({
			value: () => Dependency.value
		});
		const ProviderA = CreateServiceContainer('FactoryIsolationProviderA', {
			dependsOn: { Dependency: DependencyA },
			register
		});
		const ProviderB = CreateServiceContainer('FactoryIsolationProviderB', {
			dependsOn: { Dependency: DependencyB },
			register
		});

		expect(ProviderA().value).toBe('A');
		expect(ProviderB().value).toBe('B');
	});

	it('awaits asynchronous disposal and drops the cached browser instance', async () => {
		let finishDispose!: () => void;
		const dispose = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishDispose = resolve;
				})
		);
		let instance = 0;
		const Provider = CreateServiceContainer('BrowserCleanupProvider', {
			register: () => ({ service: () => ({ id: ++instance, dispose }) })
		});

		expect(Provider().service.id).toBe(1);
		let completed = false;
		const cleanup = cleanupProvider('BrowserCleanupProvider').then(() => {
			completed = true;
		});
		await Promise.resolve();
		expect(completed).toBe(false);

		finishDispose();
		await cleanup;
		expect(Provider().service.id).toBe(2);
	});
});
