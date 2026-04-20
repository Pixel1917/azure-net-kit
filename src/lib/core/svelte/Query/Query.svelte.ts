import { ObjectUtil } from '@azure-net/tools';
import { untrack } from 'svelte';

export type QuerySignal = {
	refresh: () => Promise<void>;
};

export interface CreateQueryOptions<T extends Record<string, unknown>> {
	initial: T;
	signal?: QuerySignal;
	excludeKeys?: (keyof T)[];
	debounceMs?: number;
	autoRefresh?: boolean;
}

export interface QueryController<T extends Record<string, unknown>> {
	data: T;
	patch: (values: Partial<T>) => void;
	set: <K extends keyof T>(key: K, value: T[K]) => void;
	reset: () => void;
	snapshot: () => T;
	initial: () => T;
	attachSignal: (signal?: QuerySignal) => void;
}

export const createQuery = <T extends Record<string, unknown>>(options: CreateQueryOptions<T>): QueryController<T> => {
	const { initial: initialValue, signal: initialSignal, excludeKeys, debounceMs = 0, autoRefresh = true } = options;

	const baseInitial = ObjectUtil.deepClone(initialValue);
	let signal: QuerySignal | undefined = initialSignal;
	let data = $state<T>(ObjectUtil.deepClone(baseInitial));

	const resolveKeys = (): (keyof T)[] => {
		const keys = (Object.keys(baseInitial) as (keyof T)[]).slice();
		if (excludeKeys?.length) {
			return keys.filter((key) => !excludeKeys.includes(key));
		}
		return keys;
	};

	const keys = resolveKeys();
	let isFirstRun = true;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	const lastValues = new Map<keyof T, unknown>();

	const scheduleRefresh = () => {
		if (!signal) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		if (debounceMs > 0) {
			debounceTimer = setTimeout(() => {
				untrack(() => {
					void signal?.refresh();
				});
			}, debounceMs);
		} else {
			untrack(() => {
				void signal?.refresh();
			});
		}
	};

	if (autoRefresh) {
		$effect(() => {
			let hasChanged = false;
			keys.forEach((key) => {
				const nextValue = data[key];
				if (!Object.is(lastValues.get(key), nextValue)) {
					hasChanged = true;
					lastValues.set(key, nextValue);
				}
			});

			if (isFirstRun) {
				isFirstRun = false;
				return;
			}

			if (hasChanged) {
				scheduleRefresh();
			}
		});
	}

	const patch = (values: Partial<T>) => {
		data = { ...data, ...values };
	};

	const set = <K extends keyof T>(key: K, value: T[K]) => {
		data = { ...data, [key]: value };
	};

	const reset = () => {
		data = ObjectUtil.deepClone(baseInitial);
	};

	const snapshot = () => ObjectUtil.deepClone(data);

	const initial = () => ObjectUtil.deepClone(baseInitial);

	const attachSignal = (nextSignal?: QuerySignal) => {
		signal = nextSignal;
	};

	return {
		get data() {
			return data;
		},
		set data(value: T) {
			data = value;
		},
		patch,
		set,
		reset,
		snapshot,
		initial,
		attachSignal
	};
};
