import { getContextInternals } from '../../shared/request-context/Internal.js';
import { RequestContext } from '../../shared/request-context/Internal.js';
import { BROWSER } from '../../external/tools/index.js';
import { AzureNetKitInternalError } from '../app-error/AppError.js';

export type ProviderKey = string | symbol;

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
	boot?: (services: ResolvedServices<T>) => undefined;
	register: ProviderFactory<T, D>;
}

const clientCache = new Map<ProviderKey, Map<string, unknown>>();
const providerProxyCache = new Map<ProviderKey, ResolvedServices<ServiceMap>>();
type ConstructionEntry = { provider: ProviderKey; member: string };
const clientConstructionStack: ConstructionEntry[] = [];

const clientBootFlags = new Map<ProviderKey, boolean>();

const getProviderCache = (providerName: ProviderKey): Map<string, unknown> => {
	if (BROWSER) {
		if (!clientCache.has(providerName)) {
			clientCache.set(providerName, new Map());
		}
		return clientCache.get(providerName)!;
	} else {
		const context = RequestContext.current();
		if (!getContextInternals(context).azureNetKitBoundaryProviders) {
			getContextInternals(context).azureNetKitBoundaryProviders = new Map();
		}

		const providers = getContextInternals(context).azureNetKitBoundaryProviders as Map<ProviderKey, Map<string, unknown>>;
		if (!providers.has(providerName)) {
			providers.set(providerName, new Map());
		}

		if (!getContextInternals(context).azureNetKitBoundaryProvidersToCleanup) {
			getContextInternals(context).azureNetKitBoundaryProvidersToCleanup = new Set<ProviderKey>();
		}
		(getContextInternals(context).azureNetKitBoundaryProvidersToCleanup as Set<ProviderKey>).add(providerName);

		return providers.get(providerName)!;
	}
};

const getProxyCache = (): Map<ProviderKey, ResolvedServices<ServiceMap>> => {
	if (BROWSER) return providerProxyCache;
	const context = RequestContext.current();
	return (getContextInternals(context).azureNetKitBoundaryProviderProxies ??= new Map()) as Map<ProviderKey, ResolvedServices<ServiceMap>>;
};

const getBootFlag = (providerName: ProviderKey): boolean => {
	if (BROWSER) {
		return clientBootFlags.get(providerName) ?? false;
	} else {
		const context = RequestContext.current();
		if (!getContextInternals(context).bootFlags) {
			getContextInternals(context).bootFlags = new Map<ProviderKey, boolean>();
		}
		const bootFlags = getContextInternals(context).bootFlags as Map<ProviderKey, boolean>;
		return bootFlags.get(providerName) ?? false;
	}
};

const setBootFlag = (providerName: ProviderKey, value: boolean): void => {
	if (BROWSER) {
		clientBootFlags.set(providerName, value);
	} else {
		const context = RequestContext.current();
		if (!getContextInternals(context).bootFlags) {
			getContextInternals(context).bootFlags = new Map<ProviderKey, boolean>();
		}
		const bootFlags = getContextInternals(context).bootFlags as Map<ProviderKey, boolean>;
		bootFlags.set(providerName, value);
	}
};

const getConstructionStack = (): ConstructionEntry[] => {
	if (BROWSER) return clientConstructionStack;
	const context = RequestContext.current();
	return (getContextInternals(context).boundaryProviderConstructionStack ??= []) as ConstructionEntry[];
};

const runWithCycleGuard = <T>(provider: ProviderKey, member: string, callback: () => T): T => {
	const stack = getConstructionStack();
	const cycleStart = stack.findIndex((entry) => entry.provider === provider && entry.member === member);
	const entry = { provider, member };
	if (cycleStart !== -1) {
		const cyclePath = [...stack.slice(cycleStart), entry].map(({ provider, member }) => `${String(provider)}.${member}`).join(' -> ');
		throw new AzureNetKitInternalError(`[BoundaryProvider] Circular provider dependency detected: ${cyclePath}`);
	}

	stack.push(entry);
	try {
		return callback();
	} finally {
		const idx = stack.lastIndexOf(entry);
		if (idx !== -1) stack.splice(idx, 1);
	}
};

export const CreateServiceContainer = <T extends ServiceMap, D extends Record<string, ProviderWithType<ServiceMap>>>(
	name: ProviderKey,
	settings: ProviderSettings<T, D>
): ProviderWithType<T> => {
	const { dependsOn = {} as D, boot, register } = settings;
	type Deps = { [K in keyof D]: InferProviderType<D[K]> };

	const providerFn = () => {
		const proxies = getProxyCache();
		if (proxies.has(name)) {
			return proxies.get(name) as ResolvedServices<T>;
		}

		const cache = getProviderCache(name);
		let factories: T | null = null;

		const getFactories = (): T => {
			if (factories) return factories;

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

			factories = runWithCycleGuard(name, 'register', () => register(deps as Deps));

			return factories;
		};

		const providerProxy = new Proxy({} as ResolvedServices<T>, {
			get(target, key: string | symbol, receiver) {
				if (typeof key === 'symbol') return Reflect.get(target, key, receiver);
				if (cache.has(key)) {
					return cache.get(key);
				}

				const factories = getFactories();

				if (!Object.hasOwn(factories, key)) {
					if (key === 'then' || key === 'toJSON') return undefined;
					if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
					throw new AzureNetKitInternalError(`[BoundaryProvider] Service '${key}' not found in provider '${String(name)}'`);
				}

				const factory = factories[key as keyof T];
				if (typeof factory !== 'function') {
					throw new AzureNetKitInternalError('[BoundaryProvider] Factory must be a function');
				}
				const instance = runWithCycleGuard(name, key, () => factory());

				if (instance && typeof (instance as Promise<unknown>)?.then === 'function') {
					throw new AzureNetKitInternalError(`[BoundaryProvider] Service '${key}' in provider '${String(name)}' returned Promise.`);
				}

				cache.set(key, instance);

				return instance;
			},

			has(target, key: string | symbol) {
				if (typeof key === 'symbol') return Reflect.has(target, key);
				if (cache.has(key)) return true;

				const factories = getFactories();
				return Object.hasOwn(factories, key) || Reflect.has(target, key);
			},

			ownKeys() {
				const factories = getFactories();
				const cachedKeys = Array.from(cache.keys());
				const factoryKeys = Object.keys(factories);
				return [...new Set([...cachedKeys, ...factoryKeys])];
			},

			getOwnPropertyDescriptor(_, key: string | symbol) {
				if (typeof key === 'symbol') return undefined;

				const factories = getFactories();
				if (!cache.has(key) && !Object.hasOwn(factories, key)) return undefined;

				return {
					configurable: true,
					enumerable: true,
					get: () => providerProxy[key as keyof ResolvedServices<T>]
				};
			}
		});

		proxies.set(name, providerProxy);

		try {
			if (boot && !getBootFlag(name)) {
				getFactories();

				const bootResult = boot(providerProxy) as unknown;
				if (bootResult && typeof (bootResult as PromiseLike<unknown>).then === 'function') {
					void Promise.resolve(bootResult).catch(() => undefined);
					throw new AzureNetKitInternalError(`[BoundaryProvider] Boot for provider '${String(name)}' must be synchronous.`);
				}
				setBootFlag(name, true);
			}
		} catch (error) {
			proxies.delete(name);
			throw error;
		}
		return providerProxy;
	};

	return providerFn as ProviderWithType<T>;
};

export async function cleanupProvider(name: ProviderKey): Promise<void> {
	const cleanupCache = async (cache: Map<string, unknown>) => {
		const promises: Promise<void>[] = [];

		for (const [key, service] of cache.entries()) {
			if (service && typeof service === 'object' && 'dispose' in service) {
				try {
					const disposeResult = (service as { dispose: () => Promise<void> | void }).dispose();
					promises.push(Promise.resolve(disposeResult).catch((err) => console.error(`Error disposing ${String(name)}.${key}:`, err)));
				} catch (err) {
					console.error(`Error disposing ${String(name)}.${key}:`, err);
				}
			}
		}

		await Promise.all(promises);
		cache.clear();
	};

	if (BROWSER) {
		const cache = clientCache.get(name);
		clientCache.delete(name);
		providerProxyCache.delete(name);
		clientBootFlags.delete(name);
		if (cache) await cleanupCache(cache);
	} else {
		const context = RequestContext.current();
		const providers = getContextInternals(context).azureNetKitBoundaryProviders as Map<ProviderKey, Map<string, unknown>> | undefined;
		getProxyCache().delete(name);
		setBootFlag(name, false);
		(getContextInternals(context).azureNetKitBoundaryProvidersToCleanup as Set<ProviderKey> | undefined)?.delete(name);
		if (providers?.has(name)) {
			const cache = providers.get(name)!;
			providers.delete(name);
			await cleanupCache(cache);
		}
	}
}
