import { Translation } from '../app/core/index.js';
import { browser } from '$app/environment';
import type { LayoutLoad } from './$types.js';

export const load: LayoutLoad = async ({ data }) => {
	const { syncTranslation } = Translation();
	if (browser) {
		await syncTranslation({ lang: data.lang }, false);
	}

	return { ...data };
};
