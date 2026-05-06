import { createApp } from '$lib/index.js';
import { PublicStore } from './app/mock-api-context/layers/delivery/public/index.js';
import { TranslationManager } from './core/translations/index.js';

export const { register, Container } = createApp((app) =>
	app
		.useServer(async ({ resolve, event }) => {
			const { preloadTranslation, applyHtmlLocaleAttr } = TranslationManager();
			await preloadTranslation();
			return resolve(event, { transformPageChunk: ({ html }) => applyHtmlLocaleAttr(html) });
		})
		.useServerError(({ message }) => {
			console.log(message);
		})
		.useClient(() => {})
		.useClientInit(() => {
			console.log('init');
		})
		.useClientError(({ error, event, message, status }) => {
			console.log(message);
			console.log(event);
			console.log(error);
			console.log(status);
		})
		.dependencies({
			storeValue: () => PublicStore().store,
			translationManager: () => TranslationManager()
		})
);
