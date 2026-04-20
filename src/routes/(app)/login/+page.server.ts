import { PublicPresenter } from '../../../app/mock-api-context/layers/delivery/public/index.js';
import type { PageServerLoad } from '../../../../.svelte-kit/types/src/routes/(app)/login/$types.js';

export const load: PageServerLoad = async () => {
	const { collection } = PublicPresenter();
	return {
		collection: await collection()
	};
};
