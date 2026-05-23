import { type BeforeNavigate } from '@sveltejs/kit';
import { ensureRoute, type EnsureRoute, type RedirectStatus } from './Shared.js';
import { page } from '$app/state';
import { goto } from '$app/navigation';

export type IClientMiddleware = (middlewareData: {
	to: URL;
	from?: URL;
	next: (location?: string | URL, status?: RedirectStatus) => void;
	ensureRoute: EnsureRoute;
}) => Promise<void> | void;

export const executeClientMiddlewares = async (middlewares: IClientMiddleware[], navigation?: BeforeNavigate) => {
	const from = navigation?.from?.url ?? undefined;
	const to = navigation?.to?.url ?? page?.url;
	for (const middleware of middlewares) {
		let shouldContinue = false;
		const next = (location?: string | URL) => {
			shouldContinue = true;
			if (location) {
				if (navigation) {
					navigation?.cancel();
				}
				return goto(location);
			}
		};

		await middleware({
			to,
			from,
			next,
			ensureRoute
		});

		if (!shouldContinue) {
			navigation?.cancel();
			if (from) {
				void goto(from.pathname);
				console.warn('Navigation blocked: middleware chain stopped (next() not called).');
			}
		}
	}
};
