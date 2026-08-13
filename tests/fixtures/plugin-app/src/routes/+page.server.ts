import { FixtureValue } from '../FixtureValue.js';

export const load = async ({ fetch, locals }: { fetch: typeof globalThis.fetch; locals: App.Locals }) => ({
	marker: locals.pluginMarker ?? 'missing',
	initialized: globalThis.azureNetFixtureInitialized === true,
	fetched: await fetch('/fixture-fetch').then((response) => response.text()),
	transported: new FixtureValue('transported')
});
