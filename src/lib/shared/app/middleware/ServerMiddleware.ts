import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { ensureRoute, type EnsureRoute } from './Shared.js';
import { BROWSER } from '../../../external/tools/index.js';
import { RequestContext } from '../../../external/edges/ServerContext.js';
import type { RedirectStatus } from '../../redirect/index.js';

export type IServerMiddleware = (middlewareData: {
	to: RequestEvent['url'];
	from?: RequestEvent['url'];
	next: (location?: string | URL, status?: RedirectStatus) => void;
	event?: RequestEvent;
	ensureRoute: EnsureRoute;
}) => Promise<void> | void;

export const executeServerMiddlewares = async (middlewares: IServerMiddleware[]) => {
	if (!BROWSER && middlewares.length) {
		const event: RequestEvent | undefined = RequestContext.current().event;
		if (event) {
			const referer = event?.request.headers.get('referer');
			const from: RequestEvent['url'] | undefined = referer ? new URL(referer) : undefined;
			const to = event?.url;
			for (const middleware of middlewares) {
				let shouldContinue = false;
				const next = (location?: string | URL, status: RedirectStatus = 301) => {
					shouldContinue = true;
					if (location) {
						return redirect(status, location);
					}
				};

				await middleware({
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
