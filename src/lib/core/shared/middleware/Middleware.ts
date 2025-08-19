import { type BeforeNavigate, error, isRedirect, type Page, redirect, type RequestEvent } from '@sveltejs/kit';
import { RequestContext } from 'edges-svelte/context';
import { browser } from '$app/environment';
import { beforeNavigate, goto } from '$app/navigation';
import { page } from '$app/state';

export type IMiddleware = (middleWareData: {
	to: RequestEvent['url'] | Page['url'];
	error: typeof error;
	redirect: (
		location: string | URL,
		status?: 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308 | number,
		navigation?: BeforeNavigate
	) => Promise<void> | void;
	onServer: (
		callback: (serverMiddleware: { context: ReturnType<typeof RequestContext.current>['event'] }) => void | Promise<void> | never | undefined
	) => void | Promise<void>;
	onClient: (callback: (clientMiddleware: { context: Page }) => void | Promise<void> | never | undefined) => void | Promise<void>;
}) => void | Promise<void> | never | undefined;

const universalRedirect = async (location: string | URL, status = 301, navigation?: BeforeNavigate) => {
	if (browser && navigation) {
		navigation?.cancel();
		return goto(location, { state: { status } });
	} else {
		return redirect(status, location);
	}
};

export const createMiddlewareManager = (middlewares: IMiddleware[]) => {
	const onServer =
		(context?: ReturnType<typeof RequestContext.current>['event']) =>
		async (
			callback: (serverMiddleware: { context: ReturnType<typeof RequestContext.current>['event'] }) => void | Promise<void> | never | undefined
		) => {
			if (!browser && context) {
				return await callback({ context: context });
			}
			return Promise.resolve();
		};

	const onClient = (page: Page) => async (callback: (clientMiddleware: { context: Page }) => void | Promise<void> | never | undefined) => {
		if (browser && page) {
			return await callback({ context: page });
		}
		return Promise.resolve();
	};

	const executeMiddlewares = async (page?: Page, navigation?: BeforeNavigate) => {
		let event: RequestEvent | undefined;
		if (!browser) {
			event = RequestContext.current().event;
		}
		const to = (browser ? (navigation?.to?.url ?? page?.url) : event?.url) as URL;
		for (const middleware of middlewares) {
			const executeMiddleware = async () => {
				return middleware({
					onServer: onServer(event),
					onClient: onClient(page as Page),
					to,
					error,
					redirect: async (location, status) => await universalRedirect(location, status, navigation)
				});
			};

			await executeMiddleware();
		}
	};

	const serverMiddleware = async () => {
		try {
			await executeMiddlewares();
		} catch (e) {
			if (isRedirect(e)) {
				console.log(e);
			}
		}
	};
	const clientMiddleware = () => {
		beforeNavigate(async (navigation) => {
			await executeMiddlewares(page, navigation);
		});
	};

	return { serverMiddleware, clientMiddleware };
};
