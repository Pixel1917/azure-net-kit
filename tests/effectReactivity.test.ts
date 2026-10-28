// @vitest-environment jsdom

import { render } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEffectRoot } from './fixtures/effectRoot.svelte.js';
import {
	createAsyncSignal,
	createAsyncSignalBatch,
	refreshAsyncSignal,
	refreshAllAsyncSignals
} from '../src/lib/svelte/async-signal/AsyncSignal.svelte.js';
import EffectHarness from './fixtures/EffectHarness.svelte';

vi.mock('@azure-net/tools/environment', () => ({ BROWSER: true }));

describe('createEffect', () => {
	it('runs initially and only reacts to explicit dependencies', async () => {
		const callback = vi.fn((state: { ignored: number }) => {
			void state.ignored;
		});
		let state!: { watched: number; ignored: number };
		const view = render(EffectHarness, {
			onRun: callback,
			expose: (value) => {
				state = value;
			}
		});

		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		state.ignored = 1;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);

		state.watched = 1;
		await tick();
		expect(callback).toHaveBeenCalledTimes(2);
		view.unmount();
	});

	it('uses Object.is for dependency values', async () => {
		const callback = vi.fn();
		let state!: { source: number };
		const view = render(EffectHarness, {
			mode: 'projected',
			onRun: callback,
			expose: (value) => {
				state = value;
			}
		});

		await tick();
		state.source = 2;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);

		state.source = 3;
		await tick();
		expect(callback).toHaveBeenCalledTimes(2);
		view.unmount();
	});

	it('runs cleanup before a changed callback and on destroy', async () => {
		const cleanup = vi.fn();
		const callback = vi.fn(() => cleanup);
		let state!: { watched: number };
		const view = render(EffectHarness, {
			onRun: callback,
			expose: (value) => {
				state = value;
			}
		});

		await tick();
		state.watched = 1;
		await tick();
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledTimes(2);

		view.unmount();
		expect(cleanup).toHaveBeenCalledTimes(2);
	});

	it('runs only once with an empty dependency list', async () => {
		const callback = vi.fn();
		let state!: { watched: number; ignored: number };
		const view = render(EffectHarness, {
			mode: 'empty',
			onRun: callback,
			expose: (value) => {
				state = value;
			}
		});

		await tick();
		state.watched = 1;
		state.ignored = 1;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('accepts an async callback without treating its promise as cleanup', async () => {
		const callback = vi.fn(async () => undefined);
		const view = render(EffectHarness, {
			onRun: callback,
			expose: () => undefined
		});

		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		expect(() => view.unmount()).not.toThrow();
	});
});

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

describe('AsyncSignal client lifecycle', () => {
	it.each([false, true])('does not register an abandoned ordinary signal (immediate: %s)', async (immediate) => {
		const handler = vi.fn(async () => 'value');
		const destroy = createEffectRoot(() => {
			createAsyncSignal(handler, { key: 'abandoned', immediate });
		});
		destroy();
		flushSync();
		await refreshAsyncSignal('abandoned');
		await refreshAllAsyncSignals();
		expect(handler).toHaveBeenCalledTimes(immediate ? 1 : 0);
	});

	it('registers live signals for keyed and all refreshes and unregisters on destruction', async () => {
		const handler = vi.fn(async () => 'value');
		const beforeSend = vi.fn();
		const destroy = createEffectRoot(() => {
			createAsyncSignal(handler, { key: 'live', immediate: false, beforeSend });
		});
		try {
			flushSync();
			await refreshAsyncSignal('live');
			await refreshAllAsyncSignals();
			expect(handler).toHaveBeenCalledTimes(2);
			expect(beforeSend.mock.calls).toEqual([[{ initial: true, source: 'global' }], [{ initial: false, source: 'global' }]]);
		} finally {
			destroy();
		}
		await refreshAsyncSignal('live');
		await refreshAllAsyncSignals();
		expect(handler).toHaveBeenCalledTimes(2);
	});

	const roots: Array<() => void> = [];
	const owned = <T>(factory: () => T): T => {
		let value!: T;
		roots.push(
			createEffectRoot(() => {
				value = factory();
			})
		);
		flushSync();
		return value;
	};
	afterEach(() => {
		roots.splice(0).forEach((destroy) => destroy());
	});
	it('global refresh overrides in-flight manual request and keeps latest data', async () => {
		const req1 = createDeferred<string>();
		const req2 = createDeferred<string>();
		const calls: Array<Deferred<string>> = [];

		const handler = vi.fn((_signal?: AbortSignal) => {
			console.log('signal', _signal);
			const next = calls.length === 0 ? req1 : req2;
			calls.push(next);
			return next.promise;
		});

		const signal = owned(() => createAsyncSignal(handler, { immediate: false, key: 'q-1' }));
		const manualPromise = signal.execute();
		const globalPromise = refreshAsyncSignal('q-1');

		await Promise.resolve();
		expect(handler).toHaveBeenCalledTimes(2);

		req2.resolve('latest');
		await globalPromise;

		req1.resolve('stale');
		await manualPromise;

		expect(signal.response).toBe('latest');
		expect('data' in signal).toBe(false);
		expect(signal.status).toBe('success');
	});

	it('stale error from old run does not overwrite latest successful state', async () => {
		const req1 = createDeferred<string>();
		const req2 = createDeferred<string>();
		const calls: Array<Deferred<string>> = [];

		const handler = vi.fn((_signal?: AbortSignal) => {
			console.log('signal', _signal);
			const next = calls.length === 0 ? req1 : req2;
			calls.push(next);
			return next.promise;
		});

		const signal = owned(() => createAsyncSignal(handler, { immediate: false, key: 'q-2' }));
		const manualPromise = signal.execute();
		const globalPromise = refreshAsyncSignal('q-2');

		await Promise.resolve();
		expect(handler).toHaveBeenCalledTimes(2);

		req2.resolve('ok-new');
		await globalPromise;

		req1.reject(new Error('stale-failure'));
		await manualPromise;

		expect(signal.response).toBe('ok-new');
		expect(signal.status).toBe('success');
		expect(signal.error).toBeUndefined();
	});

	it('does not let global refresh bypass a dormant batch or a sequential gate', async () => {
		const firstRequest = createDeferred<string>();
		const secondRequest = createDeferred<string>();
		const firstHandler = vi.fn(() => firstRequest.promise);
		const secondHandler = vi.fn(() => secondRequest.promise);
		const batch = owned(() =>
			createAsyncSignalBatch(
				(createSignal) => [createSignal(firstHandler, { key: 'batch-first' }), createSignal(secondHandler, { key: 'batch-second' })],
				{ parallel: false }
			)
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
		expect(secondSignal.response).toBe('second');
	});
});
