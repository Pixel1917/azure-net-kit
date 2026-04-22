import { EventBus } from '@azure-net/tools';
import { createPresenter } from '@azure-net/edges';

type AppEventsList = { [key: string]: unknown } & App.CustomEvents['eventNames'];

export const AppEvents = createPresenter(() => {
	const appEventBus = new EventBus<AppEventsList>({});
	return {
		bus: appEventBus
	};
});
