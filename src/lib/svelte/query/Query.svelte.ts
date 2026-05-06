import { ObjectUtil } from '../../external/tools/index.js';
import { untrack } from 'svelte';

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
	const baseInitial = ObjectUtil.deepClone(initialValue);
	let data = $state<T>(ObjectUtil.deepClone(baseInitial));

	const includeKeys = options?.onChange?.include ?? [];
	const hasWatch = Boolean(options?.onChange?.handler) && includeKeys.length > 0;
	const lastValues = new Map<keyof T, unknown>();
	let onChangeController: AbortController | null = null;
	let onChangeRunId = 0;

	if (hasWatch) {
		includeKeys.forEach((key) => {
			lastValues.set(key, data[key]);
		});

		$effect(() => {
			const changedKeys: (keyof T)[] = [];
			includeKeys.forEach((key) => {
				const nextValue = data[key];
				if (!Object.is(lastValues.get(key), nextValue)) {
					changedKeys.push(key);
					lastValues.set(key, nextValue);
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
					snapshot: ObjectUtil.deepClone(data)
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
		data = ObjectUtil.deepClone(baseInitial);
	};

	const patch = (value: Partial<T>) => {
		data = { ...data, ...value };
	};

	const snapshot = () => ObjectUtil.deepClone(data);

	const initial = () => ObjectUtil.deepClone(baseInitial);

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
