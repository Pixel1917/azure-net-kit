// @vitest-environment jsdom

import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { ActiveForm } from '../src/lib/svelte/active-form/ActiveForm.svelte.js';
import type { AsyncSignalSvelte } from '../src/lib/svelte/async-signal/AsyncSignal.svelte.js';
import type { AsyncActionResponse } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import { ErrorTypes } from '../src/lib/shared/app-error/AppError.js';
import ActiveFormHarness from './fixtures/ActiveFormHarness.svelte';

type FormData = { name: string };
type Response = { id: number };
type Result = AsyncActionResponse<Response, FormData>;

const createDeferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
};

describe('createActiveForm linked signal', () => {
	it('replaces edited values and the reset baseline after every watched refresh', async () => {
		const first = createDeferred<FormData>();
		const second = createDeferred<FormData>();
		const sharedValue = { name: 'signal value' };
		const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		let api!: {
			form: ActiveForm<FormData, Response, Record<never, never>>;
			signal: AsyncSignalSvelte<FormData>;
		};
		const view = render(ActiveFormHarness, {
			request,
			submit: async (): Promise<Result> => ({ success: true, response: { id: 1 } }),
			expose: (value) => {
				api = value;
			}
		});

		first.resolve(sharedValue);
		await vi.waitFor(() => expect(api.form.status).toBe('idle'));
		await tick();
		api.form.data.name = 'local edit';
		expect(api.form.dirty).toBe(true);

		const refresh = api.signal.refresh();
		await tick();
		second.resolve(sharedValue);
		await refresh;
		await tick();

		expect(api.form.data).toEqual({ name: 'signal value' });
		expect(api.form.dirty).toBe(false);
		expect(api.form.status).toBe('idle');
		api.form.data.name = 'another edit';
		await api.form.reset('initial');
		expect(api.form.data).toEqual({ name: 'signal value' });
		view.unmount();
	});

	it('invalidates an older submission when watched signal data arrives', async () => {
		const first = createDeferred<FormData>();
		const second = createDeferred<FormData>();
		const submission = createDeferred<Result>();
		const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		let api!: {
			form: ActiveForm<FormData, Response, Record<never, never>>;
			signal: AsyncSignalSvelte<FormData>;
		};
		const view = render(ActiveFormHarness, {
			request,
			submit: () => submission.promise,
			expose: (value) => {
				api = value;
			}
		});

		first.resolve({ name: 'initial' });
		await vi.waitFor(() => expect(api.form.status).toBe('idle'));
		const submitPromise = api.form.submit();
		await tick();
		const refresh = api.signal.refresh();
		second.resolve({ name: 'fresh signal data' });
		await refresh;
		await tick();
		submission.resolve({
			success: false,
			response: undefined as never,
			error: { type: ErrorTypes.Schema, message: 'Stale', external: false, validation: { name: 'stale error' } }
		});
		await submitPromise;

		expect(api.form.data).toEqual({ name: 'fresh signal data' });
		expect(api.form.errors).toEqual({});
		expect(api.form.pending).toBe(false);
		view.unmount();
	});

	it('does not update edited form values when signal watching is disabled', async () => {
		const first = createDeferred<FormData>();
		const second = createDeferred<FormData>();
		const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		let api!: {
			form: ActiveForm<FormData, Response, Record<never, never>>;
			signal: AsyncSignalSvelte<FormData>;
		};
		const view = render(ActiveFormHarness, {
			request,
			submit: async (): Promise<Result> => ({ success: true, response: { id: 1 } }),
			watch: false,
			expose: (value) => {
				api = value;
			}
		});

		first.resolve({ name: 'initial' });
		await vi.waitFor(() => expect(api.form.status).toBe('idle'));
		api.form.data.name = 'local edit';
		const refresh = api.signal.refresh();
		second.resolve({ name: 'new signal value' });
		await refresh;
		await tick();

		expect(api.form.data).toEqual({ name: 'local edit' });
		expect(api.form.dirty).toBe(true);
		view.unmount();
	});

	it('keeps a watched signal linked after clearing the form', async () => {
		const first = createDeferred<FormData>();
		const second = createDeferred<FormData>();
		const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		let api!: {
			form: ActiveForm<FormData, Response, Record<never, never>>;
			signal: AsyncSignalSvelte<FormData>;
		};
		const view = render(ActiveFormHarness, {
			request,
			submit: async (): Promise<Result> => ({ success: true, response: { id: 1 } }),
			expose: (value) => {
				api = value;
			}
		});

		first.resolve({ name: 'initial' });
		await vi.waitFor(() => expect(api.form.status).toBe('idle'));
		await api.form.reset('clear');
		expect(api.form.data).toEqual({});
		const refresh = api.signal.refresh();
		second.resolve({ name: 'linked again' });
		await refresh;
		await tick();

		expect(api.form.data).toEqual({ name: 'linked again' });
		expect(api.form.dirty).toBe(false);
		view.unmount();
	});
});
