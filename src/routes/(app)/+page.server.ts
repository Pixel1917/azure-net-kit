import type { PageServerLoad } from '../../../.svelte-kit/types/src/routes/(app)/$types.js';
import { PrivatePresenter } from '../../app/mock-api-context/layers/delivery/private/index.js';

export const load: PageServerLoad = async () => {
	const { collection } = PrivatePresenter();
	return {
		collection: await collection()
	};
};
