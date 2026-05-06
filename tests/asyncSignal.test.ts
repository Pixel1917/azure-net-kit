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
});
