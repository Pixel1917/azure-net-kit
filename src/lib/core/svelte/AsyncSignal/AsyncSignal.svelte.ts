import { untrack } from 'svelte';
import { EnvironmentUtil } from 'azure-net-tools';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';
export type AsyncSignalSource = 'auto' | 'manual' | 'global';

export interface AsyncSignalOptions<TData, TError = Error> {
	server?: boolean;
	immediate?: boolean;
	watch?: (() => unknown)[];
	initialData?: TData | (() => TData);
	beforeSend?: (meta: { initial: boolean; source: AsyncSignalSource }) => void | Promise<void>;
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
	const instances = EnvironmentUtil.isBrowser ? new Map<string, (source: AsyncSignalSource) => Promise<unknown>>() : undefined;

	const generateUid = () => {
		return Math.random().toString(36).substring(2, 9);
	};

	const generateKey = (): string => {
		if (instances) {
			return `${instances.size}-async-signal-${Date.now()}-${generateUid()}`;
		}
		return `async-signal-${Date.now()}-${generateUid()}`;
	};

	const register = (key: string, callback: (source: AsyncSignalSource) => Promise<unknown>) => {
		if (instances) {
			instances.set(key, callback);
		}
	};

	const unregister = (key: string, callback: (source: AsyncSignalSource) => Promise<unknown>) => {
		if (instances && instances.get(key) === callback) {
			instances.delete(key);
		}
	};

	const refreshByKey = async (key: string) => {
		if (instances) {
			const instance = instances.get(key);
			try {
				await instance?.('global');
			} catch {
				return;
			}
		}
	};

	const refreshAll = async () => {
		if (instances) {
			try {
				await Promise.all(instances.values().map((val) => val('global')));
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
	const resolvedInitialData = typeof initialData === 'function' ? (initialData as () => TData)() : initialData;

	let data = $state<TData | undefined>(resolvedInitialData);
	let error = $state<TError>();
	let status = $state<AsyncStatus>('idle');

	const pending = $derived(status === 'pending');

	let abortController: AbortController | null = null;
	let currentPromise: Promise<TData | undefined> | null = null;
	let currentRunId = 0;
	let started = false;

	const run = async (runId: number, source: AsyncSignalSource): Promise<TData | undefined> => {
		const initial = !started;
		started = true;
		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();

		if (options.beforeSend) {
			await options.beforeSend({ initial, source });
		}

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

	const start = (source: AsyncSignalSource): Promise<TData | undefined> => {
		if (currentPromise) {
			return currentPromise;
		}
		const runId = ++currentRunId;
		const localPromise = run(runId, source);
		currentPromise = localPromise;
		return localPromise;
	};

	const execute = async (): Promise<void> => {
		if (currentPromise) {
			await currentPromise;
			return;
		}
		await start('manual');
	};

	if (EnvironmentUtil.isBrowser) {
		const signalKey = key ?? asyncSignalManager.generateKey();
		const callback = (source: AsyncSignalSource) => start(source);
		asyncSignalManager.register(signalKey, callback);
		$effect(() => {
			return () => {
				asyncSignalManager.unregister(signalKey, callback);
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
					void start('auto');
				}

				isFirst = false;
			});
		}
	}

	if (immediate) {
		if (EnvironmentUtil.isServer && server) {
			untrack(() => {
				void start('auto');
			});
		} else if (EnvironmentUtil.isBrowser) {
			void start('auto');
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
			return start('auto');
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
