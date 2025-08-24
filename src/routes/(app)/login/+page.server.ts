import { LoginAction } from '../../../app/contexts/app/Delivery/Auth/index.js';
import type { PageServerLoad, Actions } from '../../../../.svelte-kit/types/src/routes/(app)/login/$types.js';

export const load: PageServerLoad = ({ locals }) => {
	return {
		user: locals.user,
		lang: locals.lang
	};
};
export const actions: Actions = {
	login: async () => await LoginAction()
};
