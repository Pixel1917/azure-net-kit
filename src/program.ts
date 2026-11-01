import { ServerMiddlewareManager, ClientMiddlewareManager } from './lib/shared/app/index.js';
import { beforeNavigate } from '$app/navigation';
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
const serverMiddlewares = new ServerMiddlewareManager([ServerAuth]);
const clientMiddlewares = new ClientMiddlewareManager([ClientNavigation]);

export const { register } = createApp((app) => {
	app.useTranslations(TranslationManager);
	app.useBoot(({ state }) => {
		PublicStore().store.value = state.demoMessage ?? 'csr';
	});
	app.useServer(async ({ resolve, event }) => {
		RequestContext.current().state.demoMessage = 'from-server';
		await serverMiddlewares.execute();
		return resolve(event);
	});
	app.useServerError(({ error, kind }) => {
		console.error(kind, error);
	});
	app.useClient(() => {
		beforeNavigate((navigation) => clientMiddlewares.execute(navigation));
	});
	app.useClientInit(() => {
		console.log('init');
	});
	app.useClientError(({ error, event, kind }) => {
		console.error(kind, error, event);
	});
});
