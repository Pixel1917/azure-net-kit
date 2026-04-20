import { TranslationManager } from '../core/translations/index.js';
import { BROWSER } from '$lib/tools/index.js';
import type { LayoutLoad } from './$types.js';

export const load: LayoutLoad = async ({ data }) => {
	const { syncTranslation } = TranslationManager();
	if (BROWSER) {
		await syncTranslation({ lang: data.lang }, false);
	}

	return { ...data };
};
