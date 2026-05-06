import { EventBus } from '../../external/tools/index.js';
import { createPresenter } from '../../external/edges/Edges.js';

type AppEventsList = { [key: string]: unknown } & App.CustomEvents['list'];

export const AppEvents = createPresenter(() => {
	const appEventBus = new EventBus<AppEventsList>({});
	return appEventBus;
});
