import { EventBus } from 'azure-net-tools';
import { createPresenter } from 'edges-svelte';

type AppEventsList = App.CustomEvents['eventNames'] | 'OnAsyncHelperError';

export const AppEvents = createPresenter(() => {
	const appEventBus = new EventBus<AppEventsList>({ OnAsyncHelperError: [] });

	return {
		bus: appEventBus
	};
});
