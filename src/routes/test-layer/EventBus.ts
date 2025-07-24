import { createEventBus, EventBusLayers, loggingMiddleware } from '$lib/core/eventBus/EventBus.js';

export interface IApplicationEvents {
	LoggedIn: string;
}

export const applicationEventBus = createEventBus<IApplicationEvents>(EventBusLayers.APPLICATION, {
	history: true,
	asyncProcessing: true,
	historySize: 100,
	middlewares: [loggingMiddleware]
});
