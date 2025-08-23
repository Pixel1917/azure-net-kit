import { RequestContext } from '../../../edges/context/index.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { EnvironmentUtil } from 'azure-net-tools';

type Deps = {
	context: Required<ReturnType<typeof RequestContext.current>['event']>;
	utils: {
		fail: typeof fail;
		redirect: typeof redirect;
		error: typeof error;
	};
};

export const createServerAction = <T>(factory: (args: Deps) => T): (() => T) => {
	return (): T => {
		if (EnvironmentUtil.isBrowser) {
			throw Error('Do not use actions on client side');
		}
		const context = RequestContext.current().event;

		return factory({ context, utils: { fail, redirect, error } } as Deps);
	};
};
