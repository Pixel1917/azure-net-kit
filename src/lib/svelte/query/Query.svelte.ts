import { untrack } from 'svelte';
import { ObjectUtil } from '../../external/tools/index.js';
import { cloneStateValue } from '../shared/cloneStateValue.js';

const trackDeep = (value: unknown, seen = new WeakSet<object>()): void => {
	if (value === null || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);

	if (Array.isArray(value)) {
		for (const item of value) trackDeep(item, seen);
		return;
	}

	if (value instanceof Map) {
		for (const [key, item] of value) {
			trackDeep(key, seen);
			trackDeep(item, seen);
		}
		return;
	}

	if (value instanceof Set) {
		for (const item of value) trackDeep(item, seen);
		return;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return;

	for (const key of Reflect.ownKeys(value)) {
		trackDeep(Reflect.get(value, key), seen);
	}
};

export interface QueryOnChangeContext<T extends Record<string, unknown>> {
	snapshot: T;
	changedKeys: (keyof T)[];
	signal: AbortSignal;
}

export interface QueryOnChangeOptions<T extends Record<string, unknown>> {
	include: (keyof T)[];
	handler: (ctx: QueryOnChangeContext<T>) => Promise<void> | void;
}

export interface CreateQueryOptions<T extends Record<string, unknown>> {
	onChange?: QueryOnChangeOptions<T>;
}

export interface QueryController<T extends Record<string, unknown>> {
	data: T;
	patch: (value: Partial<T>) => void;
	reset: () => void;
	snapshot: () => T;
	initial: () => T;
}

export const createQuery = <T extends Record<string, unknown>>(initialValue: T, options?: CreateQueryOptions<T>): QueryController<T> => {
	const baseInitial = cloneStateValue(initialValue);
	let data = $state<T>(cloneStateValue(baseInitial));

	const includeKeys = [...new Set(options?.onChange?.include ?? [])];
	const hasWatch = Boolean(options?.onChange?.handler) && includeKeys.length > 0;
	const lastSnapshots = new Map<keyof T, unknown>();
	let onChangeController: AbortController | null = null;
	let onChangeRunId = 0;

	if (hasWatch) {
		includeKeys.forEach((key) => {
			lastSnapshots.set(key, cloneStateValue(data[key]));
		});

		$effect(() => {
			const changedKeys: (keyof T)[] = [];
			includeKeys.forEach((key) => {
				const nextValue = data[key];
				trackDeep(nextValue);
				const nextSnapshot = cloneStateValue(nextValue);
				if (!ObjectUtil.equals(lastSnapshots.get(key), nextSnapshot)) {
					changedKeys.push(key);
					lastSnapshots.set(key, nextSnapshot);
				}
			});

			if (!changedKeys.length) return;

			const previousController = onChangeController;
			if (previousController) previousController.abort();

			const localController = new AbortController();
			onChangeController = localController;
			const localRunId = ++onChangeRunId;

			const run = async () => {
				await options!.onChange!.handler({
					changedKeys,
					signal: localController.signal,
					snapshot: cloneStateValue(data)
				});
			};

			untrack(() => {
				void run()
					.catch(() => undefined)
					.finally(() => {
						if (onChangeRunId === localRunId && onChangeController === localController) {
							onChangeController = null;
						}
					});
			});
		});

		$effect(() => {
			return () => {
				if (onChangeController) onChangeController.abort();
			};
		});
	}

	const reset = () => {
		data = cloneStateValue(baseInitial);
	};

	const patch = (value: Partial<T>) => {
		data = { ...data, ...value };
	};

	const snapshot = () => cloneStateValue(data);

	const initial = () => cloneStateValue(baseInitial);

	return {
		get data() {
			return data;
		},
		set data(value: T) {
			data = value;
		},
		patch,
		reset,
		snapshot,
		initial
	};
};
