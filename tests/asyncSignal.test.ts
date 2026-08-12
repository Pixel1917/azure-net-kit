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
