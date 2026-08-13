import { createApp, UniversalCookie } from '../../../../src/lib/index.js';
import { FixtureValue } from './FixtureValue.js';

declare global {
	var azureNetFixtureInitialized: boolean | undefined;
}

export const { register } = createApp(
	(app) =>
		app
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
			.useServerInit(() => {
				globalThis.azureNetFixtureInitialized = true;
			})
			.useServerFetch(({ request, fetch }) => {
				if (new URL(request.url).pathname === '/fixture-fetch') return new Response('intercepted');
				return fetch(request);
			})
			.useServer(({ event }) => {
				event.locals.pluginMarker = 'handled';
				UniversalCookie.set('fixture-cookie', 'hello world');
			}),
	'AzureNetPluginFixtureApp'
);
