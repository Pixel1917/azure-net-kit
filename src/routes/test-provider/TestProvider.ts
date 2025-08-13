import { createStore } from 'edges-svelte';
import { EventBus } from 'azure-net-tools';

export const TestProvider = createStore('TestCaching', () => {
	const bus = new EventBus<'test' | 'test2'>();

	return { bus };
});
