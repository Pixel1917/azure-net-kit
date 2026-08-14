import { untrack } from 'svelte';
import { BROWSER } from '../../external/tools/index.js';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';
export type AsyncSignalSource = 'auto' | 'manual' | 'global';

export interface AsyncSignalOptions<TData, TError = Error> {
	server?: boolean;
	immediate?: boolean;
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

export interface AsyncSignalBatchOptions {
	parallel?: boolean;
}

export interface AsyncSignalBatchFactory {
	<TData, TError = Error>(
		handler: (signal?: AbortSignal) => Promise<TData>,
		options?: Omit<AsyncSignalOptions<TData, TError>, 'immediate'>
	): AsyncSignalSvelte<TData, TError>;
}

export interface AsyncSignalBatch<TSignals extends readonly AsyncSignalSvelte<unknown, unknown>[]> {
	execute: () => TSignals;
}

const ASYNC_SIGNAL_BATCH_INTERNAL = Symbol('async-signal-batch-internal');

interface AsyncSignalBatchInternal {
	lock: (gate?: Promise<unknown>) => void;
	unlock: () => void;
	start: (source: AsyncSignalSource) => Promise<unknown>;
}

type BatchManagedAsyncSignal<TData, TError> = AsyncSignalSvelte<TData, TError> & {
	[ASYNC_SIGNAL_BATCH_INTERNAL]: AsyncSignalBatchInternal;
};

const createAsyncSignalManager = () => {
	const instances = BROWSER ? new Map<string, (source: AsyncSignalSource) => Promise<unknown>>() : undefined;

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
	const { server = false, immediate = true, initialData = undefined, key } = options;
	const resolvedInitialData = typeof initialData === 'function' ? (initialData as () => TData)() : initialData;

	let data = $state<TData | undefined>(resolvedInitialData);
	let error = $state<TError>();
	let status = $state<AsyncStatus>('idle');

	const pending = $derived(status === 'pending');

	let abortController: AbortController | null = null;
	let currentPromise: Promise<TData | undefined> | null = null;
	let currentRunId = 0;
	let started = false;
	let batchLocked = false;
	let batchGate: Promise<unknown> | null = null;
	let batchSkipRequested = false;

	const run = async (runId: number, source: AsyncSignalSource): Promise<TData | undefined> => {
		const initial = !started;
		started = true;

		const prevController = abortController;
		if (prevController) {
			prevController.abort();
		}

		const localController = new AbortController();
		abortController = localController;

		status = 'pending';
		error = undefined;

		try {
			if (options.beforeSend) {
				const beforeSendResult = options.beforeSend({ initial, source });
				if (beforeSendResult && typeof beforeSendResult.then === 'function') await beforeSendResult;
			}

			if (runId !== currentRunId || abortController !== localController || localController.signal.aborted) {
				return undefined;
			}

			const result = await handler(localController.signal);

			if (runId !== currentRunId || abortController !== localController || localController.signal.aborted) {
				return undefined;
			}

			data = result;
			status = 'success';
			if (options.onSuccess) {
				await options.onSuccess(result);
			}
			return result;
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				if (runId === currentRunId) status = 'idle';
				return undefined;
			}
			if (runId !== currentRunId || abortController !== localController || localController.signal.aborted) {
				return undefined;
			}

			error = err as TError;
			status = 'error';
			if (options.onError) {
				await options.onError(err as TError);
			}
			return undefined;
		} finally {
			if (currentRunId === runId) {
				currentPromise = null;
				if (abortController === localController) abortController = null;
			}
		}
	};

	const start = (source: AsyncSignalSource): Promise<TData | undefined> => {
		const runId = ++currentRunId;
		const localPromise = run(runId, source);
		currentPromise = localPromise;
		return localPromise;
	};

	const startWhenUnlocked = (source: AsyncSignalSource): Promise<unknown> => {
		if (batchLocked) return batchGate ?? Promise.resolve(data);
		return start(source);
	};

	const execute = async (): Promise<void> => {
		if (batchLocked) {
			await batchGate;
			return;
		}
		if (currentPromise) {
			await currentPromise;
			return;
		}
		await start('manual');
	};

	const refresh = async (): Promise<void> => {
		if (batchLocked) {
			await batchGate;
			return;
		}
		await start('manual');
	};

	if (BROWSER) {
		const signalKey = key ?? asyncSignalManager.generateKey();
		const callback = (source: AsyncSignalSource) => startWhenUnlocked(source);
		asyncSignalManager.register(signalKey, callback);
		$effect(() => {
			return () => {
				asyncSignalManager.unregister(signalKey, callback);
			};
		});
	}

	if (immediate) {
		if (!BROWSER && server) {
			untrack(() => {
				void start('auto');
			});
		} else if (BROWSER) {
			void start('auto');
		}
	}

	const asyncSignal: AsyncSignalSvelte<TData, TError> = {
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
			if (batchLocked) return (batchGate ?? Promise.resolve(data)) as Promise<TData | undefined>;
			if (currentPromise) return currentPromise;
			return start('auto');
		},
		execute,
		refresh,
		reset: () => {
			if (batchLocked) batchSkipRequested = true;
			currentRunId += 1;
			abortController?.abort();
			abortController = null;
			currentPromise = null;
			data = undefined;
			error = undefined;
			status = 'idle';
		},
		abort: () => {
			if (batchLocked) batchSkipRequested = true;
			currentRunId += 1;
			abortController?.abort();
			abortController = null;
			currentPromise = null;
			error = undefined;
			status = 'idle';
		}
	};

	Object.defineProperty(asyncSignal, ASYNC_SIGNAL_BATCH_INTERNAL, {
		value: {
			lock: (gate?: Promise<unknown>) => {
				batchLocked = true;
				batchGate = gate ?? null;
				batchSkipRequested = false;
			},
			unlock: () => {
				batchLocked = false;
				batchGate = null;
			},
			start: (source: AsyncSignalSource) => {
				if (batchSkipRequested) return Promise.resolve(undefined);
				return start(source);
			}
		} satisfies AsyncSignalBatchInternal
	});

	return asyncSignal;
};

const createDeferred = () => {
	let resolve!: (value: unknown) => void;
	const promise = new Promise<unknown>((promiseResolve) => {
		resolve = promiseResolve;
	});

	return { promise, resolve };
};

export const createAsyncSignalBatch = <const TSignals extends readonly AsyncSignalSvelte<unknown, unknown>[]>(
	factory: (createSignal: AsyncSignalBatchFactory) => TSignals,
	options: AsyncSignalBatchOptions = {}
): AsyncSignalBatch<TSignals> => {
	const internals = new Map<AsyncSignalSvelte<unknown, unknown>, AsyncSignalBatchInternal>();
	const createSignal: AsyncSignalBatchFactory = <TData, TError = Error>(
		handler: (signal?: AbortSignal) => Promise<TData>,
		signalOptions: Omit<AsyncSignalOptions<TData, TError>, 'immediate'> = {}
	) => {
		const signal = createAsyncSignal(handler, { ...signalOptions, immediate: false }) as BatchManagedAsyncSignal<TData, TError>;
		const internal = signal[ASYNC_SIGNAL_BATCH_INTERNAL];
		internal.lock();
		internals.set(signal, internal);
		return signal;
	};
	const signals = factory(createSignal);
	const uniqueSignals = new Set(signals);

	if (uniqueSignals.size !== signals.length || signals.some((signal) => !internals.has(signal))) {
		throw new Error('[AsyncSignalBatch] Factory must return each signal created by createSignal exactly once.');
	}
	if (internals.size !== signals.length) {
		throw new Error('[AsyncSignalBatch] Factory must return every signal created by createSignal.');
	}

	let running = false;

	const execute = (): TSignals => {
		if (running || signals.length === 0) return signals;
		running = true;

		const gates = signals.map(() => createDeferred());
		signals.forEach((signal, index) => {
			internals.get(signal)?.lock(gates[index].promise);
		});

		queueMicrotask(() => {
			if (options.parallel !== false) {
				let remaining = signals.length;
				signals.forEach((signal, index) => {
					const internal = internals.get(signal)!;
					void internal
						.start('manual')
						.catch(() => undefined)
						.then((result) => {
							gates[index].resolve(result);
							internal.unlock();
							remaining -= 1;
							if (remaining === 0) running = false;
						});
				});
				return;
			}

			void (async () => {
				for (let index = 0; index < signals.length; index += 1) {
					const signal = signals[index];
					const internal = internals.get(signal)!;
					const result = await internal.start('manual').catch(() => undefined);
					gates[index].resolve(result);
					internal.unlock();

					if (signal.status !== 'success') {
						for (let skippedIndex = index + 1; skippedIndex < signals.length; skippedIndex += 1) {
							const skippedSignal = signals[skippedIndex];
							gates[skippedIndex].resolve(undefined);
							internals.get(skippedSignal)?.unlock();
						}
						break;
					}
				}
			})().finally(() => {
				running = false;
			});
		});

		return signals;
	};

	return { execute };
};

export const refreshAsyncSignal = async (key: string) => {
	return await asyncSignalManager.refreshByKey(key);
};

export const refreshAllAsyncSignals = async () => {
	return await asyncSignalManager.refreshAll();
};
