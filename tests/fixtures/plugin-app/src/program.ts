import { TranslationManager as Manager } from '@azure-net/kit/i18n';
export const TranslationManager = new Manager({
	messages: {
		en: async () => ({ unused: 'UNUSED_DICTIONARY_SENTINEL', title: 'Fixture EN' }),
		ru: async () => ({ unused: 'UNUSED_DICTIONARY_SENTINEL', title: 'Fixture RU' })
	},
	initLang: 'en',
	initLangFromAcceptLanguage: true
});
import { RequestContext } from '@azure-net/kit/server-context';
import { useBootState } from './BootState.svelte.js';
import { createApp, UniversalCookie } from '@azure-net/kit';
import { FixtureValue } from './FixtureValue.js';

declare global {
	var azureNetFixtureInitialized: boolean | undefined;
}

export const { register } = createApp((app) =>
	app
		.useTranslations(TranslationManager)
		.useBoot(({ state }) => {
			useBootState().value = state.testId ?? 'empty';
		})
		.useTransport({
			FixtureValue: {
				encode: (value) => value instanceof FixtureValue && [value.value],
				decode: ([value]) => new FixtureValue(value)
			}
		})
		.useReroute(async ({ url, fetch }) => {
			if (url.pathname !== '/alias') return undefined;
			const response = await fetch('/fixture-fetch');
			if ((await response.text()) !== 'intercepted') throw new Error('handleFetch did not run during reroute');
			return '/';
		})
		.useServerError(({ kind, error }) => {
			if (kind === 'unknown') return { status: 503, message: 'fixture-unknown' };
			return { status: error.status, message: 'fixture-' + kind };
		})
		.useServerInit(() => {
			globalThis.azureNetFixtureInitialized = true;
		})
		.useServerFetch(({ request, fetch }) => {
			if (new URL(request.url).pathname === '/fixture-fetch') return new Response('intercepted');
			return fetch(request);
		})
		.useServer(({ event, resolve }) => {
			event.locals.pluginMarker = 'handled';
			RequestContext.current().state.testId = event.url.searchParams.get('user') ?? 'boot-ready';
			UniversalCookie.set('fixture-cookie', 'hello world');
			return resolve(event, { transformPageChunk: ({ html }) => html });
		})
);
