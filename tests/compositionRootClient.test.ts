import { describe, it, expect, vi } from 'vitest';
vi.mock('@azure-net/tools/environment', async (original) => ({
	...(await original<typeof import('@azure-net/tools/environment')>()),
	BROWSER: true
}));
import { CompositionRoot } from '../src/lib/shared/boundary-provider/CompositionRoot.js';
import { cleanupProvider } from '../src/lib/shared/boundary-provider/Provider.js';

describe('CompositionRoot browser caching', () => {
	it('shares service instances without request context and supports detached resolution', async () => {
		const construct = vi.fn(() => ({ value: 1 }));
		const shared = new CompositionRoot({ register: () => ({ datasource: construct }) });
		const first = new CompositionRoot({ dependsOn: { shared }, register: ({ shared }) => ({ value: () => shared.datasource }) });
		const second = new CompositionRoot({ dependsOn: { shared }, register: ({ shared }) => ({ value: () => shared.datasource }) });
		const { resolveContainer } = first;
		expect(resolveContainer()).toBe(first.resolveContainer());
		expect(resolveContainer().value).toBe(second.resolveContainer().value);
		expect(construct).toHaveBeenCalledOnce();
		await cleanupProvider(first.name);
		await cleanupProvider(second.name);
		await cleanupProvider(shared.name);
	});
});
