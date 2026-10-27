import { error, type RequestEvent } from '@sveltejs/kit';
import { FixtureValue } from '../FixtureValue.js';

export const load = async ({ fetch, locals, url }: RequestEvent) => {
	if (url.searchParams.get('failure') === 'app') error(418, 'Expected fixture error');
	if (url.searchParams.get('failure') === 'unknown') throw new Error('private-fixture-error');
	return {
		marker: locals.pluginMarker ?? 'missing',
		initialized: globalThis.azureNetFixtureInitialized === true,
		fetched: await fetch('/fixture-fetch').then((response) => response.text()),
		transported: new FixtureValue('transported')
	};
};
