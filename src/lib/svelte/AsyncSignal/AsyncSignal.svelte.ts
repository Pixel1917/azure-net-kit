import { untrack } from 'svelte';
import { browser } from '$app/environment';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';

export interface AsyncSignalOptions<TData> {
	server?: boolean;
	immediate?: boolean;
	watch?: (() => unknown)[];
	initialData?: TData | null;
}

export type Ref<T> = { value: T };

export interface AsyncSignalSvelte<TData, TError = Error> {
	data: Ref<TData | null>;
	error: Ref<TError | null>;
	status: Ref<AsyncStatus>;
	pending: Ref<boolean>;
	execute: () => Promise<void>;
	refresh: () => Promise<void>;
	reset: () => void;
	abort: () => void;
}

const createState = <T>(val: T) => {
	let state = $state<T>(val);
	return {
		get value() {
			return state;
		},
		set value(val: T) {
			state = val;
		}
	};
};

const createDerived = <T>(val: T) => {
	const state = $derived.by<T>(() => val);
	return {
		get value() {
			return state;
		}
	};
};

export const createAsyncSignal = <TData, TError = Error>(
	handler: (signal?: AbortSignal) => Promise<TData>,
	options: AsyncSignalOptions<TData> = {}
): AsyncSignalSvelte<TData, TError> => {
	const { server = false, immediate = true, watch = [], initialData = null } = options;

	const data = createState<TData | null>(initialData);
	const error = createState<TError | null>(null);
	const status = createState<AsyncStatus>('idle');

	const pending = createDerived(status.value === 'pending');

	let abortController: AbortController | null = null;

	async function execute(): Promise<void> {
		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();

		status.value = 'pending';
		error.value = null;

		try {
			const result = await handler(abortController.signal);

			if (abortController.signal.aborted) {
				return;
			}

			data.value = result;
			status.value = 'success';
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				return;
			}

			error.value = err as TError;
			status.value = 'error';
		}
	}

	if (browser && watch.length > 0) {
		let isFirst = true;

		$effect(() => {
			watch.forEach((dep) => dep());

			if (isFirst && !immediate) {
				isFirst = false;
				return;
			}

			if (!isFirst) {
				void execute();
			}

			isFirst = false;
		});
	}

	if (immediate) {
		if (!browser && server) {
			untrack(() => {
				void execute();
			});
		} else if (browser) {
			void execute();
		}
	}

	return {
		data,
		error,
		status,
		pending,
		execute,
		refresh: execute,
		reset: () => {
			data.value = null;
			error.value = null;
			status.value = 'idle';
			if (abortController) {
				abortController.abort();
				abortController = null;
			}
		},
		abort: () => {
			if (abortController) {
				abortController.abort();
			}
		}
	};
};
