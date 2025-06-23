import { RequestContext } from '../../edges/context/index.js';
import { browser } from '$app/environment';

export const createActionsProvider = <T, I extends Record<string, unknown> = Record<string, unknown>>(
	name: string,
	factory: (args: I & { context: Required<typeof RequestContext> }) => T,
	inject?: I
): (() => T) => {
	const cacheKey = name;
	return (): T => {
		if (browser) {
			throw Error('Do not use actions on client side');
		}
		const context = RequestContext.current();
		if (!context.data.providers) {
			context.data.providers = new Map();
		}
		const contextMap: Map<string, unknown> = context.data.providers;

		if (cacheKey && contextMap.has(cacheKey)) {
			return contextMap.get(cacheKey) as T;
		}

		const instance = factory({ ...inject, context: RequestContext } as I & { context: Required<typeof RequestContext> });
		if (cacheKey) {
			contextMap.set(cacheKey, instance);
		}
		return instance;
	};
};

export const createActionsProviderFactory = <I extends Record<string, unknown>>(inject: I) => {
	return function createInjectedProvider<T>(name: string, factory: (args: I & { context: Required<typeof RequestContext> }) => T): () => T {
		return createActionsProvider(name, factory, inject);
	};
};
