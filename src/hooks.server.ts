import { dev } from '$app/environment';
import { edgesHandle } from '$lib/edges/server/index.js';
import { type Handle } from '@sveltejs/kit';
import { Translation } from './app/core/index.js';
import { serverMiddleware } from './app/core/index.js';

export const handle: Handle = async ({ event, resolve }) => {
	return edgesHandle(
		event,
		async ({ edgesEvent, serialize }) => {
			await serverMiddleware();
			const { preloadTranslation, applyHtmlLocaleAttr } = Translation();
			await preloadTranslation(edgesEvent);
			return resolve(edgesEvent, {
				transformPageChunk: ({ html }) => {
					const serialized = serialize(html);
					return applyHtmlLocaleAttr(serialized);
				}
			});
		},
		dev
	);
};
