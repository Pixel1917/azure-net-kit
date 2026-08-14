import { describe, expect, it, vi, afterEach } from 'vitest';

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
};

const createDeferred = <T>(): Deferred<T> => {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

describe('AsyncSignal', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it('global refresh overrides in-flight manual request and keeps latest data', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: true }));
		const { createAsyncSignal, refreshAsyncSignal } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');

		const req1 = createDeferred<string>();
		const req2 = createDeferred<string>();
		const calls: Array<Deferred<string>> = [];

		const handler = vi.fn((_signal?: AbortSignal) => {
			console.log('signal', _signal);
			const next = calls.length === 0 ? req1 : req2;
			calls.push(next);
			return next.promise;
		});

		const signal = createAsyncSignal(handler, { immediate: false, key: 'q-1' });
		const manualPromise = signal.execute();
		const globalPromise = refreshAsyncSignal('q-1');

		await Promise.resolve();
		expect(handler).toHaveBeenCalledTimes(2);

		req2.resolve('latest');
		await globalPromise;

		req1.resolve('stale');
		await manualPromise;

		expect(signal.data).toBe('latest');
		expect(signal.status).toBe('success');
	});

	it('stale error from old run does not overwrite latest successful state', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: true }));
		const { createAsyncSignal, refreshAsyncSignal } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');

		const req1 = createDeferred<string>();
		const req2 = createDeferred<string>();
		const calls: Array<Deferred<string>> = [];

		const handler = vi.fn((_signal?: AbortSignal) => {
			console.log('signal', _signal);
			const next = calls.length === 0 ? req1 : req2;
			calls.push(next);
			return next.promise;
		});

		const signal = createAsyncSignal(handler, { immediate: false, key: 'q-2' });
		const manualPromise = signal.execute();
		const globalPromise = refreshAsyncSignal('q-2');

		await Promise.resolve();
		expect(handler).toHaveBeenCalledTimes(2);

		req2.resolve('ok-new');
		await globalPromise;

		req1.reject(new Error('stale-failure'));
		await manualPromise;

		expect(signal.data).toBe('ok-new');
		expect(signal.status).toBe('success');
		expect(signal.error).toBeUndefined();
	});

	it('instance refresh supersedes an in-flight execution and keeps the latest result', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignal } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const first = createDeferred<string>();
		const second = createDeferred<string>();
		const requests = [first, second];
		const aborts: boolean[] = [];
		const handler = vi.fn((signal?: AbortSignal) => {
			const request = requests[handler.mock.calls.length - 1];
			signal?.addEventListener('abort', () => aborts.push(true), { once: true });
			return request.promise;
		});
		const signal = createAsyncSignal(handler, { immediate: false });

		const execution = signal.execute();
		const refresh = signal.refresh();

		expect(handler).toHaveBeenCalledTimes(2);
		expect(aborts).toEqual([true]);

		second.resolve('latest');
		await refresh;
		first.resolve('stale');
		await execution;

		expect(signal.data).toBe('latest');
		expect(signal.status).toBe('success');
	});

	it('execute still deduplicates concurrent calls', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignal } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const request = createDeferred<string>();
		const handler = vi.fn(() => request.promise);
		const signal = createAsyncSignal(handler, { immediate: false });

		const first = signal.execute();
		const second = signal.execute();

		expect(handler).toHaveBeenCalledTimes(1);
		request.resolve('done');
		await Promise.all([first, second]);
		expect(signal.data).toBe('done');
	});

	it('handles beforeSend failures and remains executable', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignal } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const error = new Error('before-send failed');
		const onError = vi.fn();
		let shouldFail = true;
		const handler = vi.fn(async () => 'ok');
		const signal = createAsyncSignal(handler, {
			immediate: false,
			beforeSend: () => {
				if (shouldFail) throw error;
			},
			onError
		});

		await signal.execute();
		expect(signal.status).toBe('error');
		expect(signal.error).toBe(error);
		expect(signal.pending).toBe(false);
		expect(onError).toHaveBeenCalledWith(error);

		shouldFail = false;
		await signal.execute();
		expect(signal.status).toBe('success');
		expect(signal.data).toBe('ok');
	});

	it('reset invalidates an in-flight handler even when it ignores AbortSignal', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignal } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const request = createDeferred<string>();
		const signal = createAsyncSignal(() => request.promise, { immediate: false });

		const execution = signal.execute();
		expect(signal.pending).toBe(true);
		signal.reset();
		request.resolve('stale');
		await execution;

		expect(signal.data).toBeUndefined();
		expect(signal.error).toBeUndefined();
		expect(signal.status).toBe('idle');
		expect(signal.pending).toBe(false);
	});

	it('abort clears pending state and prevents stale writes', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignal } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const request = createDeferred<string>();
		const signal = createAsyncSignal(() => request.promise, { immediate: false });

		const execution = signal.execute();
		signal.abort();
		expect(signal.status).toBe('idle');
		expect(signal.pending).toBe(false);

		request.resolve('stale');
		await execution;
		expect(signal.data).toBeUndefined();
		expect(signal.status).toBe('idle');
	});
});

describe('AsyncSignalBatch', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it('does not start signals until execute and starts parallel signals together', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignalBatch } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const firstRequest = createDeferred<string>();
		const secondRequest = createDeferred<string>();
		const firstHandler = vi.fn(() => firstRequest.promise);
		const secondHandler = vi.fn(() => secondRequest.promise);
		const batch = createAsyncSignalBatch((createSignal) => [createSignal(firstHandler), createSignal(secondHandler, { initialData: 'initial' })]);

		expect(firstHandler).not.toHaveBeenCalled();
		expect(secondHandler).not.toHaveBeenCalled();

		const [firstSignal, secondSignal] = batch.execute();
		expect(firstHandler).not.toHaveBeenCalled();
		expect(secondHandler).not.toHaveBeenCalled();
		expect(secondSignal.data).toBe('initial');

		await Promise.resolve();
		expect(firstHandler).toHaveBeenCalledTimes(1);
		expect(secondHandler).toHaveBeenCalledTimes(1);
		expect(firstSignal.status).toBe('pending');
		expect(secondSignal.status).toBe('pending');

		firstRequest.resolve('first');
		await firstSignal.ready;
		expect(firstSignal.data).toBe('first');
		expect(firstSignal.status).toBe('success');
		expect(secondSignal.status).toBe('pending');

		secondRequest.resolve('second');
		await secondSignal.ready;
		expect(secondSignal.data).toBe('second');
	});

	it('runs sequential signals in order and allows later handlers to read earlier data', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignalBatch } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const firstRequest = createDeferred<{ id: number }>();
		const secondRequest = createDeferred<string>();
		const firstHandler = vi.fn(() => firstRequest.promise);
		const secondHandler = vi.fn((id: string) => {
			void id;
			return secondRequest.promise;
		});
		const batch = createAsyncSignalBatch(
			(createSignal) => {
				const first = createSignal(firstHandler);
				const second = createSignal(() => secondHandler(String(first.data!.id)));
				return [first, second] as const;
			},
			{ parallel: false }
		);
		const [firstSignal, secondSignal] = batch.execute();
		const secondReady = secondSignal.ready;

		await Promise.resolve();
		expect(firstHandler).toHaveBeenCalledTimes(1);
		expect(secondHandler).not.toHaveBeenCalled();
		expect(secondSignal.status).toBe('idle');

		firstRequest.resolve({ id: 42 });
		await firstSignal.ready;
		await Promise.resolve();
		expect(secondHandler).toHaveBeenCalledWith('42');
		expect(secondSignal.status).toBe('pending');

		secondRequest.resolve('done');
		await expect(secondReady).resolves.toBe('done');
		expect(secondSignal.data).toBe('done');
	});

	it('waits for onSuccess before starting the next sequential signal', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignalBatch } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const success = createDeferred<void>();
		const secondHandler = vi.fn(async () => 'second');
		const batch = createAsyncSignalBatch(
			(createSignal) => [createSignal(async () => 'first', { onSuccess: () => success.promise }), createSignal(secondHandler)],
			{ parallel: false }
		);
		const [firstSignal, secondSignal] = batch.execute();

		await vi.waitFor(() => expect(firstSignal.status).toBe('success'));
		expect(secondHandler).not.toHaveBeenCalled();

		success.resolve();
		await firstSignal.ready;
		await secondSignal.ready;
		expect(secondHandler).toHaveBeenCalledTimes(1);
	});

	it('stops a sequential batch after an error and releases skipped ready promises', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignalBatch } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const failure = new Error('failed');
		const secondHandler = vi.fn(async () => 'second');
		const thirdHandler = vi.fn(async () => 'third');
		const batch = createAsyncSignalBatch(
			(createSignal) => [
				createSignal(async () => {
					throw failure;
				}),
				createSignal(secondHandler),
				createSignal(thirdHandler)
			],
			{ parallel: false }
		);
		const [firstSignal, secondSignal, thirdSignal] = batch.execute();
		const skippedReady = Promise.all([secondSignal.ready, thirdSignal.ready]);

		await firstSignal.ready;
		await expect(skippedReady).resolves.toEqual([undefined, undefined]);
		expect(firstSignal.status).toBe('error');
		expect(firstSignal.error).toBe(failure);
		expect(secondSignal.status).toBe('idle');
		expect(thirdSignal.status).toBe('idle');
		expect(secondHandler).not.toHaveBeenCalled();
		expect(thirdHandler).not.toHaveBeenCalled();
	});

	it('does not start a sequential signal aborted while it waits for its turn', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignalBatch } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const firstRequest = createDeferred<string>();
		const secondHandler = vi.fn(async () => 'second');
		const batch = createAsyncSignalBatch((createSignal) => [createSignal(() => firstRequest.promise), createSignal(secondHandler)], {
			parallel: false
		});
		const [firstSignal, secondSignal] = batch.execute();
		const secondReady = secondSignal.ready;

		secondSignal.abort();
		firstRequest.resolve('first');
		await firstSignal.ready;
		await expect(secondReady).resolves.toBeUndefined();
		expect(secondHandler).not.toHaveBeenCalled();
		expect(secondSignal.status).toBe('idle');
	});

	it('does not let global refresh bypass a dormant batch or a sequential gate', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: true }));
		const { createAsyncSignalBatch, refreshAsyncSignal } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const firstRequest = createDeferred<string>();
		const secondRequest = createDeferred<string>();
		const firstHandler = vi.fn(() => firstRequest.promise);
		const secondHandler = vi.fn(() => secondRequest.promise);
		const batch = createAsyncSignalBatch(
			(createSignal) => [createSignal(firstHandler, { key: 'batch-first' }), createSignal(secondHandler, { key: 'batch-second' })],
			{ parallel: false }
		);

		await refreshAsyncSignal('batch-second');
		expect(secondHandler).not.toHaveBeenCalled();

		const [firstSignal, secondSignal] = batch.execute();
		const globalRefresh = refreshAsyncSignal('batch-second');
		await Promise.resolve();
		expect(firstHandler).toHaveBeenCalledTimes(1);
		expect(secondHandler).not.toHaveBeenCalled();

		firstRequest.resolve('first');
		await firstSignal.ready;
		expect(secondHandler).toHaveBeenCalledTimes(1);
		secondRequest.resolve('second');
		await globalRefresh;
		expect(secondSignal.data).toBe('second');
	});

	it('deduplicates execute while running and can rerun the same signal tuple', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignalBatch } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const requests = [createDeferred<number>(), createDeferred<number>()];
		const handler = vi.fn(() => requests[handler.mock.calls.length - 1].promise);
		const batch = createAsyncSignalBatch((createSignal) => [createSignal(handler)]);
		const firstExecution = batch.execute();
		const duplicateExecution = batch.execute();

		expect(duplicateExecution).toBe(firstExecution);
		await Promise.resolve();
		expect(handler).toHaveBeenCalledTimes(1);

		requests[0].resolve(1);
		await firstExecution[0].ready;

		const secondExecution = batch.execute();
		expect(secondExecution).toBe(firstExecution);
		await Promise.resolve();
		expect(handler).toHaveBeenCalledTimes(2);

		requests[1].resolve(2);
		await secondExecution[0].ready;
		expect(secondExecution[0].data).toBe(2);
	});

	it('rejects foreign, duplicate and omitted factory signals', async () => {
		vi.doMock('@azure-net/tools/environment', () => ({ BROWSER: false }));
		const { createAsyncSignal, createAsyncSignalBatch } = await import('../src/lib/svelte/async-signal/AsyncSignal.svelte.js');
		const foreignSignal = createAsyncSignal(async () => 'foreign', { immediate: false });

		expect(() => createAsyncSignalBatch(() => [foreignSignal])).toThrow(/Factory must return each signal/);
		expect(() =>
			createAsyncSignalBatch((createSignal) => {
				const signal = createSignal(async () => 'value');
				return [signal, signal];
			})
		).toThrow(/Factory must return each signal/);
		expect(() =>
			createAsyncSignalBatch((createSignal) => {
				createSignal(async () => 'omitted');
				return [];
			})
		).toThrow(/Factory must return every signal/);
	});
});
