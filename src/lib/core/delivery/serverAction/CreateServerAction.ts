import { RequestContext } from '../../../edges/context/index.js';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { EnvironmentUtil } from 'azure-net-tools';

type NoConflict<I, D> = {
	[K in keyof I]: K extends keyof D ? never : I[K];
};

type Deps = {
	context: RequestEvent;
	utils: {
		fail: typeof fail;
		redirect: typeof redirect;
		error: typeof error;
	};
};

export const createServerAction = <T, I extends Record<string, unknown> = Record<string, unknown>>(
	factory: (args: Deps & NoConflict<I, Deps>) => T,
	inject?: I
): (() => T) => {
	return (): T => {
		if (EnvironmentUtil.isBrowser) {
			throw Error('Do not use actions on client side');
		}
		const context = RequestContext.current().event;

		const deps = {
			context,
			utils: { fail, redirect, error },
			...inject
		} as Deps & NoConflict<I, Deps>;

		return factory(deps);
	};
};

export const createServerActionFactory = <I extends Record<string, unknown>>(inject: I) => {
	return function createInjectedServerAction<T>(factory: (args: Deps & NoConflict<I, Deps>) => T): () => T {
		return createServerAction(factory, inject);
	};
};
