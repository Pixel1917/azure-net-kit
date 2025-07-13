import { createProvider } from 'edges-svelte';
import { EventBus } from 'azure-net-tools';

export const TestProvider = createProvider('TestCaching', () => {
	const bus = new EventBus<'test' | 'test2'>();

	return { bus };
});
