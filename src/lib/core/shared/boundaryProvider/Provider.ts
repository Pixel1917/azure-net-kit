import { RequestContext } from '../../../edges/context/index.js';
import { BROWSER } from '@azure-net/tools/environment';

type ServiceFactory<T> = () => T;
type ServiceMap = Record<string, ServiceFactory<unknown>>;
type ResolvedServices<T extends ServiceMap> = {
	[K in keyof T]: ReturnType<T[K]>;
};

type InferProviderType<T> = T extends ProviderWithType<infer S> ? ResolvedServices<S> : never;
export interface ProviderWithType<T extends ServiceMap> {
	(): ResolvedServices<T>;
	__types__: T;
}

type ProviderFactory<T extends ServiceMap, D extends Record<string, ProviderWithType<ServiceMap>>> = (context: {
	[K in keyof D]: InferProviderType<D[K]>;
}) => T;

export interface ProviderSettings<T extends ServiceMap, D extends Record<string, ProviderWithType<ServiceMap>>> {
	dependsOn?: D;
	boot?: (services: ResolvedServices<T>) => void | Promise<void>;
	register: ProviderFactory<T, D>;
}

const clientCache = new Map<string, Map<string, unknown>>();
const factoriesCache = new WeakMap<ProviderFactory<ServiceMap, Record<string, ProviderWithType<ServiceMap>>>, ServiceMap>();
const providerProxyCache = new Map<string, ResolvedServices<ServiceMap>>();

const clientBootFlags = new Map<string, boolean>();

const getProviderCache = (providerName: string): Map<string, unknown> => {
	if (BROWSER) {
		if (!clientCache.has(providerName)) {
			clientCache.set(providerName, new Map());
		}
		return clientCache.get(providerName)!;
	} else {
		const context = RequestContext.current();
		if (!context.data.providers) {
			context.data.providers = new Map();
		}

		const providers = context.data.providers as Map<string, Map<string, unknown>>;
		if (!providers.has(providerName)) {
			providers.set(providerName, new Map());
		}

		if (!context.data.providersToCleanup) {
			context.data.providersToCleanup = new Set<string>();
		}
		(context.data.providersToCleanup as Set<string>).add(providerName);

		return providers.get(providerName)!;
	}
};

const getBootFlag = (providerName: string): boolean => {
	if (BROWSER) {
		return clientBootFlags.get(providerName) ?? false;
	} else {
		const context = RequestContext.current();
		if (!context.data.bootFlags) {
			context.data.bootFlags = new Map<string, boolean>();
		}
		const bootFlags = context.data.bootFlags as Map<string, boolean>;
		return bootFlags.get(providerName) ?? false;
	}
};

const setBootFlag = (providerName: string, value: boolean): void => {
	if (BROWSER) {
		clientBootFlags.set(providerName, value);
	} else {
		const context = RequestContext.current();
		if (!context.data.bootFlags) {
			context.data.bootFlags = new Map<string, boolean>();
		}
		const bootFlags = context.data.bootFlags as Map<string, boolean>;
		bootFlags.set(providerName, value);
	}
};

export const createBoundaryProvider = <T extends ServiceMap, D extends Record<string, ProviderWithType<ServiceMap>>>(
	name: string,
	settings: ProviderSettings<T, D>
): ProviderWithType<T> => {
	const { dependsOn = {} as D, boot, register } = settings;
	type Deps = { [K in keyof D]: InferProviderType<D[K]> };

	const providerFn = () => {
		if (BROWSER && providerProxyCache.has(name)) {
			return providerProxyCache.get(name) as ResolvedServices<T>;
		}

		const cache = getProviderCache(name);
		let factories: T | null = null;

		type UntypedFactoryCache = ProviderFactory<ServiceMap, Record<string, ProviderWithType<ServiceMap>>>;

		const getFactories = (): T => {
			if (factories) return factories;

			if (factoriesCache.has(register as UntypedFactoryCache)) {
				factories = factoriesCache.get(register as UntypedFactoryCache) as T;
				return factories;
			}

			const deps: Record<string, unknown> = {};
			const depInstances = new Map<string, ResolvedServices<ServiceMap>>();

			for (const [depName, depProvider] of Object.entries(dependsOn)) {
				deps[depName] = new Proxy(
					{},
					{
						get(_, serviceKey: string) {
							if (!depInstances.has(depName)) {
								depInstances.set(depName, depProvider());
							}
							const dep = depInstances.get(depName);
							return dep?.[serviceKey as keyof typeof dep];
						}
					}
				);
			}

			factories = register(deps as Deps);

			if (BROWSER) {
				factoriesCache.set(register as UntypedFactoryCache, factories);
			}

			return factories;
		};

		const providerProxy = new Proxy({} as ResolvedServices<T>, {
			get(_, key: string) {
				if (cache.has(key)) {
					return cache.get(key);
				}

				const factories = getFactories();

				if (!(key in factories)) {
					throw new Error(`Service '${key}' not found in provider '${name}'`);
				}

				const factory = factories[key as keyof T];
				if (typeof factory !== 'function') {
					throw Error('Factory must be a function');
				}
				const instance = factory();

				if (instance && typeof (instance as Promise<unknown>)?.then === 'function') {
					throw new Error(`Service '${key}' in provider '${name}' returned Promise.`);
				}

				cache.set(key, instance);

				return instance;
			},

			has(_, key: string) {
				if (cache.has(key)) return true;

				const factories = getFactories();
				return key in factories;
			},

			ownKeys() {
				const factories = getFactories();
				const cachedKeys = Array.from(cache.keys());
				const factoryKeys = Object.keys(factories);
				return [...new Set([...cachedKeys, ...factoryKeys])];
			}
		});

		if (BROWSER) {
			providerProxyCache.set(name, providerProxy);
		}

		if (boot && !getBootFlag(name)) {
			setBootFlag(name, true);
			getFactories();

			const bootResult = boot(providerProxy);
			if (bootResult instanceof Promise) {
				bootResult.catch((err) => console.error(`Error in boot for provider '${name}':`, err));
			}
		}

		return providerProxy;
	};

	return providerFn as ProviderWithType<T>;
};

export function cleanupProvider(name: string): void {
	const cleanupCache = async (cache: Map<string, unknown>) => {
		const promises: Promise<void>[] = [];

		for (const [key, service] of cache.entries()) {
			if (service && typeof service === 'object' && 'dispose' in service) {
				const disposeResult = (service as { dispose: () => Promise<void> | void }).dispose();
				if (disposeResult instanceof Promise) {
					promises.push(disposeResult.catch((err) => console.error(`Error disposing ${name}.${key}:`, err)));
				}
			}
		}

		await Promise.all(promises);
		cache.clear();
	};

	if (BROWSER) {
		const cache = clientCache.get(name);
		if (cache) {
			void cleanupCache(cache);
		}
		providerProxyCache.delete(name);
		clientBootFlags.delete(name);
	} else {
		const context = RequestContext.current();
		const providers = context.data.providers as Map<string, Map<string, unknown>> | undefined;
		if (providers?.has(name)) {
			const cache = providers.get(name)!;
			void cleanupCache(cache);
		}
	}
}
