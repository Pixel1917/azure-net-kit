import { type BeforeNavigate } from '@sveltejs/kit';
import { ensureRoute, type EnsureRoute } from './Shared.js';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import type { RedirectStatus } from '../../redirect/index.js';

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
		let redirectTo: string | URL | undefined;
		const next = (location?: string | URL) => {
			shouldContinue = true;
			redirectTo = location;
		};

		const result = middleware({
			to,
			from,
			next,
			ensureRoute
		});
		if (result && typeof result.then === 'function') await result;

		if (redirectTo) {
			navigation?.cancel();
			await goto(redirectTo);
			return;
		}

		if (!shouldContinue) {
			navigation?.cancel();
			console.warn('Navigation blocked: middleware chain stopped (next() not called).');
			return;
		}
	}
};
