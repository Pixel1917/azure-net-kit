import { untrack } from 'svelte';
import { EnvironmentUtil } from 'azure-net-tools';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';

export interface AsyncSignalOptions<TData, TError = Error> {
	server?: boolean;
	immediate?: boolean;
	watch?: (() => unknown)[];
	initialData?: TData;
	onSuccess?: (data: TData) => void | Promise<void>;
	onError?: (error: TError) => void | Promise<void>;
	key?: string;
}

export interface AsyncSignalSvelte<TData, TError = Error> {
	data?: TData;
	error?: TError;
	status: AsyncStatus;
	pending: boolean;
	execute: () => Promise<void>;
	refresh: () => Promise<void>;
	ready: Promise<TData | undefined>;
	reset: () => void;
	abort: () => void;
}

const createAsyncSignalManager = () => {
	const instances = EnvironmentUtil.isBrowser ? new Map<string, () => Promise<void>>() : undefined;

	const generateUid = () => {
		return Math.random().toString(36).substring(2, 9);
	};

	const generateKey = (): string => {
		if (instances) {
			return `${instances.size}-async-signal-${Date.now()}-${generateUid()}`;
		}
		return `async-signal-${Date.now()}-${generateUid()}`;
	};

	const register = (key: string, callback: () => Promise<void>) => {
		if (instances) {
			instances.set(key, callback);
		}
	};

	const unregister = (key: string) => {
		if (instances) {
			instances.delete(key);
		}
	};

	const refreshByKey = async (key: string) => {
		if (instances) {
			const instance = instances.get(key);
			try {
				await instance?.();
			} catch {
				return;
			}
		}
	};

	const refreshAll = async () => {
		if (instances) {
			try {
				await Promise.all(instances.values().map((val) => val()));
			} catch {
				return;
			}
		}
	};

	return { refreshAll, refreshByKey, generateKey, register, unregister };
};

const asyncSignalManager = createAsyncSignalManager();

export const createAsyncSignal = <TData, TError = Error>(
	handler: (signal?: AbortSignal) => Promise<TData>,
	options: AsyncSignalOptions<TData, TError> = {}
): AsyncSignalSvelte<TData, TError> => {
	const { server = false, immediate = true, watch = [], initialData = undefined, key } = options;

	let data = $state<TData | undefined>(initialData);
	let error = $state<TError>();
	let status = $state<AsyncStatus>('idle');

	const pending = $derived(status === 'pending');

	let abortController: AbortController | null = null;
	let currentPromise: Promise<TData | undefined> | null = null;
	let currentRunId = 0;

	const run = async (runId: number): Promise<TData | undefined> => {
		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();

		status = 'pending';
		error = undefined;

		try {
			const result = await handler(abortController.signal);

			if (abortController.signal.aborted) {
				return undefined;
			}

			data = result;
			status = 'success';
			if (options.onSuccess) {
				options.onSuccess(result);
			}
			return result;
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				return undefined;
			}

			error = err as TError;
			status = 'error';
			if (options.onError) {
				options.onError(err as TError);
			}
			return undefined;
		} finally {
			if (currentRunId === runId) {
				currentPromise = null;
			}
		}
	};

	const start = (): Promise<TData | undefined> => {
		const runId = ++currentRunId;
		const localPromise = run(runId);
		currentPromise = localPromise;
		return localPromise;
	};

	const execute = async (): Promise<void> => {
		if (status === 'pending' && currentPromise) {
			await currentPromise;
			return;
		}
		await start();
	};

	if (EnvironmentUtil.isBrowser) {
		const signalKey = key ?? asyncSignalManager.generateKey();
		asyncSignalManager.register(signalKey, () => execute());
		$effect(() => {
			return () => {
				asyncSignalManager.unregister(signalKey);
			};
		});
		if (watch.length > 0) {
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
	}

	if (immediate) {
		if (EnvironmentUtil.isServer && server) {
			untrack(() => {
				void execute();
			});
		} else if (EnvironmentUtil.isBrowser) {
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
		get ready() {
			if (currentPromise) return currentPromise;
			return start();
		},
		execute,
		refresh: execute,
		reset: () => {
			data = undefined;
			error = undefined;
			status = 'idle';
			currentPromise = null;
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

export const refreshAsyncSignal = async (key: string) => {
	return await asyncSignalManager.refreshByKey(key);
};

export const refreshAllAsyncSignals = async () => {
	return await asyncSignalManager.refreshAll();
};
