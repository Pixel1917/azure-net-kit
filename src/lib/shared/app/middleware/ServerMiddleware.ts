import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { ensureRoute, type EnsureRoute } from './Shared.js';
import { BROWSER } from '../../../external/tools/index.js';
import { RequestContext } from '../../../shared/request-context/Internal.js';
import type { RedirectStatus } from '../../../svelte/redirect/index.js';
import type { IMiddleware, MiddlewareClass } from './Types.js';

export interface ServerMiddlewareContext {
	to: RequestEvent['url'];
	from?: RequestEvent['url'];
	next: (location?: string | URL, status?: RedirectStatus) => void;
	event: RequestEvent;
	ensureRoute: EnsureRoute;
}

export interface IServerMiddleware extends IMiddleware<ServerMiddlewareContext, Promise<void> | void> {
	execute(context: ServerMiddlewareContext): Promise<void> | void;
}
export type ServerMiddlewareClass = MiddlewareClass<IServerMiddleware>;

export const executeServerMiddlewares = async (middlewares: readonly ServerMiddlewareClass[]) => {
	if (!BROWSER && middlewares.length) {
		const event: RequestEvent | undefined = RequestContext.current().event;
		if (event) {
			const referer = event?.request.headers.get('referer');
			const from: RequestEvent['url'] | undefined = referer && URL.canParse(referer) ? new URL(referer) : undefined;
			const to = event?.url;
			for (const middleware of middlewares) {
				let shouldContinue = false;
				const next = (location?: string | URL, status: RedirectStatus = 301) => {
					shouldContinue = true;
					if (location) {
						return redirect(status, location);
					}
				};

				await new middleware().execute({
					event,
					to,
					from,
					next,
					ensureRoute
				});

				if (!shouldContinue) {
					error(403, 'Navigation blocked: middleware chain stopped (next() not called).');
				}
			}
		}
	}
};
