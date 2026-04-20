import { EventBus } from '@azure-net/tools';
import { createPresenter } from '@azure-net/edges';

type AppEventsList = { OnAsyncHelperError: unknown; [key: string]: unknown } & App.CustomEvents['eventNames'];

export const AppEvents = createPresenter(() => {
	const appEventBus = new EventBus<AppEventsList>({ OnAsyncHelperError: [] });
	return {
		bus: appEventBus
	};
});
