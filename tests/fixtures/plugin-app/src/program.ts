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

export const { register } = createApp((app) => {
	app.useTranslations(TranslationManager);
	app.useBoot(({ state }) => {
		useBootState().value = state.testId ?? 'empty';
	});
	app.useTransport({
		FixtureValue: {
			encode: (value) => value instanceof FixtureValue && [value.value],
			decode: ([value]) => new FixtureValue(value)
		}
	});
	app.useReroute(async ({ url, fetch }) => {
		if (url.pathname !== '/alias') return undefined;
		const response = await fetch('/fixture-fetch');
		if ((await response.text()) !== 'intercepted') throw new Error('handleFetch did not run during reroute');
		return '/';
	});
	app.useServerError(({ kind, error }) => {
		if (kind === 'unknown') return { status: 503, message: 'fixture-unknown' };
		return { status: error.status, message: 'fixture-' + kind };
	});
	app.useServerInit(() => {
		globalThis.azureNetFixtureInitialized = true;
	});
	app.useServerFetch(({ request, fetch }) => {
		if (new URL(request.url).pathname === '/fixture-fetch') return new Response('intercepted');
		return fetch(request);
	});
	app.useServer(({ event, resolve }) => {
		event.locals.pluginMarker = 'handled';
		RequestContext.current().state.testId = event.url.searchParams.get('user') ?? 'boot-ready';
		UniversalCookie.set('fixture-cookie', 'hello world');
		return resolve(event, { transformPageChunk: ({ html }) => html });
	});
});
