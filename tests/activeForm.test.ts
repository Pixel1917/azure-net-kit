import { describe, expect, it, vi } from 'vitest';
import { createActiveForm } from '../src/lib/svelte/active-form/ActiveForm.svelte.js';
import { ErrorTypes } from '../src/lib/shared/app-error/AppError.js';
import type { AsyncActionResponse } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';

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

describe('createActiveForm', () => {
	it('waits for initialData before submitting', async () => {
		const initial = createDeferred<Partial<FormData>>();
		const onSubmit = vi.fn(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));
		const form = createActiveForm(onSubmit, {
			initialData: () => initial.promise,
			successBehavior: 'default'
		});

		const submission = form.submit();
		expect(form.pending).toBe(true);
		expect(onSubmit).not.toHaveBeenCalled();

		initial.resolve({ name: 'ready' });
		await submission;

		expect(onSubmit).toHaveBeenCalledWith({ name: 'ready' });
		expect(form.pending).toBe(false);
	});

	it('allows only the latest submission to update form state', async () => {
		const first = createDeferred<Result>();
		const second = createDeferred<Result>();
		const onSubmit = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const form = createActiveForm(onSubmit, {
			initialData: () => ({ name: 'initial' }),
			successBehavior: 'clear'
		});
		await form.ready;

		form.data = { name: 'first' };
		const firstSubmission = form.submit();
		await Promise.resolve();
		form.data = { name: 'second' };
		const secondSubmission = form.submit();
		await Promise.resolve();

		first.resolve({ success: true, response: { id: 1 } });
		await firstSubmission;
		expect(form.pending).toBe(true);
		expect(form.data).toEqual({ name: 'second' });

		second.resolve({
			success: false,
			response: undefined as never,
			error: { type: ErrorTypes.Schema, message: 'Validation failed', external: false, validation: { name: 'latest error' } }
		});
		await secondSubmission;

		expect(form.pending).toBe(false);
		expect(form.data).toEqual({ name: 'second' });
		expect(form.errors).toEqual({ name: 'latest error' });
	});

	it('reset invalidates an in-flight submission', async () => {
		const request = createDeferred<Result>();
		const form = createActiveForm(() => request.promise, {
			initialData: () => ({ name: 'initial' })
		});
		await form.ready;

		const submission = form.submit();
		await Promise.resolve();
		await form.reset('clear');
		request.resolve({
			success: false,
			response: undefined as never,
			error: { type: ErrorTypes.Schema, message: 'Validation failed', external: false, validation: { name: 'stale error' } }
		});
		await submission;

		expect(form.pending).toBe(false);
		expect(form.data).toEqual({});
		expect(form.errors).toEqual({});
	});

	it('does not let pending initialData overwrite an explicit reset', async () => {
		const initial = createDeferred<Partial<FormData>>();
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialData: () => initial.promise
		});

		await form.reset('clear');
		initial.resolve({ name: 'stale initial' });
		await form.ready;

		expect(form.data).toEqual({});
	});
});
