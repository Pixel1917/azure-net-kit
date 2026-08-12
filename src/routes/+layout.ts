import { TranslationManager } from '../core/translations/index.js';
import { BROWSER } from '$lib/external/tools/index.js';
import type { LayoutLoad } from './$types.js';

export const load: LayoutLoad = async ({ data }) => {
	const { initializeClient } = TranslationManager();
	if (BROWSER) {
		await initializeClient();
	}

	return { ...data };
};
