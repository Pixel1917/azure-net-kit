import { replaceState } from '$app/navigation';
import { page } from '$app/state';
import { createEffect, type EffectCallback, type EffectDependency } from '../effect/Effect.svelte.js';
import { cloneStateValue } from '../shared/cloneStateValue.js';
import { fromSearchParams, toSearchParams } from './SearchParamsSync.js';

type QueryPathDepth = readonly [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown];
type QueryLeaf =
	| bigint
	| boolean
	| Date
	| File
	| Blob
	| ((...args: never[]) => unknown)
	| Map<unknown, unknown>
	| null
	| number
	| readonly unknown[]
	| RegExp
	| Set<unknown>
	| string
	| symbol
	| undefined
	| URL
	| URLSearchParams;

export type QueryPath<T, Depth extends readonly unknown[] = QueryPathDepth> = Depth extends readonly [unknown, ...infer Rest]
	? T extends QueryLeaf
		? never
		: T extends object
			? {
					[K in Extract<keyof T, string>]: NonNullable<T[K]> extends QueryLeaf ? K : K | `${K}.${QueryPath<NonNullable<T[K]>, Rest>}`;
				}[Extract<keyof T, string>]
			: never
	: never;

export interface QuerySearchParamsSync<T extends Record<string, unknown>> {
	fromSearchParams?: (params: URLSearchParams, initial: Readonly<T>) => Partial<T>;
	toSearchParams?: (data: Readonly<T>, initial: Readonly<T>) => URLSearchParams;
}

export interface CreateQueryOptions<T extends Record<string, unknown>> {
	syncWithSearchParams?: boolean | QuerySearchParamsSync<T>;
}

const trackDeep = (value: unknown, seen?: WeakSet<object>): void => {
	if (value === null || typeof value !== 'object') return;

	const visited = seen ?? new WeakSet<object>();
	if (visited.has(value)) return;
	visited.add(value);

	if (Array.isArray(value)) {
		for (const item of value) trackDeep(item, visited);
		return;
	}

	if (value instanceof Map) {
		for (const [key, item] of value) {
			trackDeep(key, visited);
			trackDeep(item, visited);
		}
		return;
	}

	if (value instanceof Set) {
		for (const item of value) trackDeep(item, visited);
		return;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return;

	for (const key of Reflect.ownKeys(value)) trackDeep(Reflect.get(value, key), visited);
};

const readPath = (source: unknown, path: string): unknown => {
	let value = source;

	for (const key of path.split('.')) {
		if (value === null || typeof value !== 'object') return undefined;
		value = Reflect.get(value, key);
	}

	return value;
};

const createDeepDependency = (read: () => unknown): EffectDependency => {
	let version = 0;

	return () => {
		const value = read();
		if (value === null || typeof value !== 'object') return value;

		trackDeep(value);
		return ++version;
	};
};

export interface QueryController<T extends Record<string, unknown>> {
	data: T;
	patch: (value: Partial<T>) => void;
	reset: () => void;
	createSnapshot: () => T;
	getInitial: () => T;
	createEffect: (callback: EffectCallback, dependencies?: readonly QueryPath<T>[]) => void;
}

export const createQuery = <T extends Record<string, unknown>>(initialValue: T, options?: CreateQueryOptions<T>): QueryController<T> => {
	const baseInitial = cloneStateValue(initialValue);
	const searchParamsSync = options?.syncWithSearchParams;
	const syncSettings = typeof searchParamsSync === 'object' ? searchParamsSync : undefined;
	const syncEnabled = Boolean(searchParamsSync);
	const parseSearchParams = syncSettings?.fromSearchParams ?? fromSearchParams<T>;
	const serializeSearchParams = syncSettings?.toSearchParams ?? toSearchParams<T>;
	const parsedInitial = syncEnabled ? parseSearchParams(new URLSearchParams(page.url.searchParams), cloneStateValue(baseInitial)) : undefined;
	let data = $state<T>(parsedInitial ? { ...cloneStateValue(baseInitial), ...cloneStateValue(parsedInitial) } : cloneStateValue(baseInitial));

	const reset = () => {
		data = cloneStateValue(baseInitial);
	};

	const patch = (value: Partial<T>) => {
		data = { ...data, ...value };
	};

	const createSnapshot = () => cloneStateValue(data);
	const getInitial = () => cloneStateValue(baseInitial);
	const createQueryEffect = (callback: EffectCallback, dependencies?: readonly QueryPath<T>[]) => {
		const effectDependencies =
			dependencies === undefined
				? [createDeepDependency(() => data)]
				: [...new Set(dependencies)].map((path) => createDeepDependency(() => readPath(data, path)));

		createEffect(callback, effectDependencies);
	};

	if (syncEnabled) {
		const managedKeys = new Set(Object.keys(baseInitial));
		const captureInitialSyncedData = () => cloneStateValue(data);
		const initialSyncedData = captureInitialSyncedData();
		let initialized = false;

		createEffect(() => {
			const nextParams = serializeSearchParams(data, baseInitial);
			for (const key of nextParams.keys()) managedKeys.add(key);

			if (!initialized) {
				initialized = true;
				const initialParams = serializeSearchParams(initialSyncedData, baseInitial);
				for (const key of initialParams.keys()) managedKeys.add(key);
				if (nextParams.toString() === initialParams.toString()) return;
			}

			const url = new URL(page.url);
			for (const key of managedKeys) url.searchParams.delete(key);
			for (const [key, value] of nextParams) url.searchParams.append(key, value);

			if (url.search !== page.url.search) replaceState(url, page.state);
		}, [createDeepDependency(() => data)]);
	}

	return {
		get data() {
			return data;
		},
		set data(value: T) {
			data = value;
		},
		patch,
		reset,
		createSnapshot,
		getInitial,
		createEffect: createQueryEffect
	};
};
