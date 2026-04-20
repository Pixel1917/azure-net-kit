import { TranslationManager } from './core/translations/index.js';
import { serverMiddleware } from './core/middleware/index.js';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	await serverMiddleware();
	const { preloadTranslation, applyHtmlLocaleAttr } = TranslationManager();
	await preloadTranslation();
	return resolve(event, {
		transformPageChunk: ({ html }) => applyHtmlLocaleAttr(html)
	});
};
