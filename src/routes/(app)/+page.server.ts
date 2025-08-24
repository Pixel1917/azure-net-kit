import { LogoutAction } from '../../app/contexts/app/Delivery/Auth/index.js';
import { ScriptPresenter } from '../../app/contexts/app/Delivery/Script/index.js';
import type { PageServerLoad, Actions } from '../../../.svelte-kit/types/src/routes/(app)/$types.js';

export const load: PageServerLoad = async () => {
	const { collection } = ScriptPresenter();
	return {
		scripts: await collection()
	};
};

export const actions: Actions = {
	logout: async () => await LogoutAction()
};
