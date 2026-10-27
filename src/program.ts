import { PublicStore } from './app/mock-api-context/layers/delivery/public/PublicStore.svelte.js';
import { RequestContext } from './lib/shared/request-context/Internal.js';
import { createApp, type IClientMiddleware, type IServerMiddleware, type ClientMiddlewareContext, type ServerMiddlewareContext } from '#lib/index.js';
import { TranslationManager } from './core/translations/index.js';

class ServerAuth implements IServerMiddleware {
	execute({ to, next, event }: ServerMiddlewareContext) {
		if (to.pathname === '/' && !event.cookies.get('test')) return next('/login');
		next();
	}
}
class ClientNavigation implements IClientMiddleware {
	execute({ next, to }: ClientMiddlewareContext) {
		console.log(to.pathname);
		return next();
	}
}
export const { register } = createApp((app) =>
	app
		.useTranslations(TranslationManager)
		.useBoot(({ state }) => {
			PublicStore().store.value = state.demoMessage ?? 'csr';
		})
		.useServer(async ({ resolve, event, useMiddlewares }) => {
			RequestContext.current().state.demoMessage = 'from-server';
			await useMiddlewares([ServerAuth]);
			return resolve(event);
		})
		.useServerError(({ error, kind }) => {
			console.error(kind, error);
		})
		.useClient(({ useMiddlewares }) => {
			useMiddlewares([ClientNavigation]);
		})
		.useClientInit(() => {
			console.log('init');
		})
		.useClientError(({ error, event, kind }) => {
			console.error(kind, error, event);
		})
);
