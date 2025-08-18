import { createEventBus, loggingMiddleware } from '$lib/core/shared/eventBus/EventBus.js';

export interface IApplicationEvents {
	LoggedIn: string;
}

export const applicationEventBus = createEventBus<IApplicationEvents>({
	history: true,
	asyncProcessing: true,
	historySize: 100,
	middlewares: [loggingMiddleware],
	debug: true
});
