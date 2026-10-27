import { ensureRoute, type EnsureRoute } from './Shared.js';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import type { BeforeNavigate, GotoOptions } from '$app/navigation';
import type { ReadonlyURL } from '$app/state';
import type { IMiddleware, MiddlewareClass } from './Types.js';

export interface ClientMiddlewareContext {
	to: ReadonlyURL;
	from?: ReadonlyURL;
	navigation?: BeforeNavigate;
	next: (location?: string | URL, options?: GotoOptions) => undefined;
	ensureRoute: EnsureRoute;
}

export interface IClientMiddleware extends IMiddleware<ClientMiddlewareContext, undefined> {
	execute(context: ClientMiddlewareContext): undefined;
}
export type ClientMiddlewareClass = MiddlewareClass<IClientMiddleware>;

export const executeClientMiddlewares = (middlewares: readonly ClientMiddlewareClass[], navigation?: BeforeNavigate): void => {
	const from = navigation?.from?.url ?? undefined;
	const to = navigation?.to?.url ?? page.url;
	for (const middleware of middlewares) {
		let shouldContinue = false;
		let redirectTo: string | URL | undefined;
		let redirectOptions: GotoOptions | undefined;
		let active = true;
		const next = (location?: string | URL, options?: GotoOptions) => {
			if (!active) throw new Error('[Middleware] next() must be called synchronously and only once.');
			active = false;
			shouldContinue = true;
			redirectTo = location;
			redirectOptions = options;
			return undefined;
		};

		let result: unknown;
		try {
			result = new middleware().execute({
				to,
				from,
				next,
				ensureRoute,
				navigation
			});
		} catch (error) {
			navigation?.cancel();
			throw error;
		} finally {
			active = false;
		}
		if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
			navigation?.cancel();
			void Promise.resolve(result).catch(() => undefined);
			throw new Error('[Middleware] Client execute() must be synchronous.');
		}

		if (redirectTo !== undefined) {
			navigation?.cancel();
			void goto(redirectTo, redirectOptions).catch((error: unknown) => console.error('[Middleware] Redirect failed:', error));
			return;
		}

		if (!shouldContinue) {
			navigation?.cancel();
			console.warn('Navigation blocked: middleware chain stopped (next() not called).');
			return;
		}
	}
};
