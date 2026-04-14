import { type Handle } from '@sveltejs/kit';
import { Translation } from './app/core/index.js';
import { serverMiddleware } from './app/core/index.js';

export const handle: Handle = async ({ event, resolve }) => {
	await serverMiddleware();
	const { preloadTranslation, applyHtmlLocaleAttr } = Translation();
	await preloadTranslation();
	return resolve(event, {
		transformPageChunk: ({ html }) => applyHtmlLocaleAttr(html)
	});
};
