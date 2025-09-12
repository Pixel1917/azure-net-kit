import { EventBus } from 'azure-net-tools';
import { createPresenter } from 'edges-svelte';

export const AppEvents = createPresenter('GlobalAppEventBus', () => {
	const appEventBus = new EventBus<'OnAsyncHelperError'>({ OnAsyncHelperError: [] });

	return {
		bus: appEventBus
	};
});
