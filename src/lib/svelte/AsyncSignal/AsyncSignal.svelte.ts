import { untrack } from 'svelte';
import { browser } from '$app/environment';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';

export interface AsyncSignalOptions<TData> {
	server?: boolean;
	immediate?: boolean;
	watch?: (() => unknown)[];
	initialData?: TData | null;
}

export interface AsyncSignalSvelte<TData, TError = Error> {
	data: TData | null;
	error: TError | null;
	status: AsyncStatus;
	pending: boolean;
	execute: () => Promise<void>;
	refresh: () => Promise<void>;
	reset: () => void;
	abort: () => void;
}

export const createAsyncSignal = <TData, TError = Error>(
	handler: (signal?: AbortSignal) => Promise<TData>,
	options: AsyncSignalOptions<TData> = {}
): AsyncSignalSvelte<TData, TError> => {
	const { server = false, immediate = true, watch = [], initialData = null } = options;

	let data = $state<TData | null>(initialData);
	let error = $state<TError | null>(null);
	let status = $state<AsyncStatus>('idle');

	const pending = $derived(status === 'pending');

	let abortController: AbortController | null = null;

	async function execute(): Promise<void> {
		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();

		status = 'pending';
		error = null;

		try {
			const result = await handler(abortController.signal);

			if (abortController.signal.aborted) {
				return;
			}

			data = result;
			status = 'success';
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				return;
			}

			error = err as TError;
			status = 'error';
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
		get data() {
			return data;
		},
		get error() {
			return error;
		},
		get status() {
			return status;
		},
		get pending() {
			return pending;
		},
		execute,
		refresh: execute,
		reset: () => {
			data = null;
			error = null;
			status = 'idle';
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
