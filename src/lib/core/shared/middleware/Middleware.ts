import { type BeforeNavigate, error, type Page, redirect, type RequestEvent } from '@sveltejs/kit';
import { RequestContext } from 'edges-svelte/context';
import { beforeNavigate, goto } from '$app/navigation';
import { page } from '$app/state';
import { EnvironmentUtil } from 'azure-net-tools';
import { UniversalCookie } from '../cookie/index.js';

type RedirectStatus = 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308;

export type IMiddleware = (middlewareData: {
	to: RequestEvent['url'] | Page['url'];
	from?: RequestEvent['url'] | Page['url'];
	error: typeof error;
	next: (location?: string | URL, status?: RedirectStatus) => void;
	isServer: boolean;
	cookies: typeof UniversalCookie;
	event?: RequestEvent;
	page: Page;
}) => Promise<void> | void;

export const createMiddlewareManager = (middlewares: IMiddleware[]) => {
	const universalRedirect = (location: string | URL, status: RedirectStatus = 301, navigation?: BeforeNavigate) => {
		if (EnvironmentUtil.isBrowser) {
			if (navigation) {
				navigation?.cancel();
			}
			return goto(location);
		} else {
			return redirect(status, location);
		}
	};

	const executeMiddlewares = async (navigation?: BeforeNavigate) => {
		let event: RequestEvent | undefined;
		let from: RequestEvent['url'] | Page['url'] | undefined = undefined;
		if (EnvironmentUtil.isServer) {
			event = RequestContext.current().event;
			const referer = event?.request.headers.get('referer');
			from = referer ? new URL(referer) : undefined;
		} else {
			from = navigation?.from?.url ?? undefined;
		}
		const to = (EnvironmentUtil.isBrowser ? (navigation?.to?.url ?? page?.url) : event?.url) as URL;
		for (const middleware of middlewares) {
			let shouldContinue = false;
			const next = (location?: string | URL, status: RedirectStatus = 301) => {
				shouldContinue = true;
				if (location) {
					return universalRedirect(location, status, navigation);
				}
			};

			await middleware({
				event,
				page,
				cookies: UniversalCookie,
				isServer: EnvironmentUtil.isServer,
				to,
				from,
				error,
				next
			});

			if (!shouldContinue) {
				if (EnvironmentUtil.isBrowser) {
					navigation?.cancel();
					if (from) {
						void goto(from.pathname);
						console.warn('Navigation blocked: middleware chain stopped (next() not called).');
					}
				} else {
					error(403, 'Navigation blocked: middleware chain stopped (next() not called).');
				}
			}
		}
	};

	const serverMiddleware = async () => await executeMiddlewares();
	const clientMiddleware = () => {
		beforeNavigate(async (navigation) => {
			await executeMiddlewares(navigation);
		});
	};

	return { serverMiddleware, clientMiddleware, executeMiddlewares };
};
