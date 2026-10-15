import { PublicStore } from './app/mock-api-context/layers/delivery/public/PublicStore.svelte.js';
import { RequestContext } from './lib/shared/request-context/Internal.js';
import { createApp } from '#lib/index.js';
import { TranslationManager } from './core/translations/index.js';

export const { register } = createApp((app) =>
	app
		.useTranslations(TranslationManager)
		.useBoot(({ state }) => {
			PublicStore().store.value = state.demoMessage ?? 'csr';
		})
		.useServer(async ({ resolve, event, useMiddlewares }) => {
			RequestContext.current().state.demoMessage = 'from-server';
			await useMiddlewares([
				({ to, next, event }) => {
					if (to.pathname === '/' && !event?.cookies.get('test')) {
						next('/login');
					}
					next();
				}
			]);
			return resolve(event);
		})
		.useServerError(({ message }) => {
			console.log(message);
		})
		.useClient(({ useMiddlewares }) => {
			useMiddlewares([
				({ next, to }) => {
					if (to.pathname.startsWith('/')) {
						console.log(to.pathname);
					}
					return next();
				}
			]);
		})
		.useClientInit(() => {
			console.log('init');
		})
		.useClientError(({ error, event, message, status }) => {
			console.log(message);
			console.log(event);
			console.log(error);
			console.log(status);
		})
);
