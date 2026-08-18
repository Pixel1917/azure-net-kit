import { type BeforeNavigate } from '@sveltejs/kit';
import { ensureRoute, type EnsureRoute } from './Shared.js';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import type { RedirectStatus } from '../../redirect/index.js';

export type IClientMiddleware = (middlewareData: {
	to: URL;
	from?: URL;
	next: (location?: string | URL, status?: RedirectStatus) => undefined;
	ensureRoute: EnsureRoute;
}) => undefined;

export const executeClientMiddlewares = (middlewares: IClientMiddleware[], navigation?: BeforeNavigate): void => {
	const from = navigation?.from?.url ?? undefined;
	const to = navigation?.to?.url ?? page?.url;
	for (const middleware of middlewares) {
		let shouldContinue = false;
		let redirectTo: string | URL | undefined;
		const next = (location?: string | URL) => {
			shouldContinue = true;
			redirectTo = location;
			return undefined;
		};

		middleware({
			to,
			from,
			next,
			ensureRoute
		});

		if (redirectTo) {
			navigation?.cancel();
			void goto(redirectTo);
			return;
		}

		if (!shouldContinue) {
			navigation?.cancel();
			console.warn('Navigation blocked: middleware chain stopped (next() not called).');
			return;
		}
	}
};
