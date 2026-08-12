import { describe, expect, it, vi } from 'vitest';

vi.mock('@azure-net/tools/environment', async (importOriginal) => ({
	...(await importOriginal<typeof import('@azure-net/tools/environment')>()),
	BROWSER: true
}));

import { createBoundaryProvider } from '../src/lib/shared/boundary-provider/Provider.js';

describe('createBoundaryProvider in browser', () => {
	it('does not share factories between providers that reuse the same register callback', () => {
		const DependencyA = createBoundaryProvider('FactoryIsolationDependencyA', {
			register: () => ({ value: () => 'A' })
		});
		const DependencyB = createBoundaryProvider('FactoryIsolationDependencyB', {
			register: () => ({ value: () => 'B' })
		});
		const register = ({ Dependency }: { Dependency: { value: string } }) => ({
			value: () => Dependency.value
		});
		const ProviderA = createBoundaryProvider('FactoryIsolationProviderA', {
			dependsOn: { Dependency: DependencyA },
			register
		});
		const ProviderB = createBoundaryProvider('FactoryIsolationProviderB', {
			dependsOn: { Dependency: DependencyB },
			register
		});

		expect(ProviderA().value).toBe('A');
		expect(ProviderB().value).toBe('B');
	});
});
