import { describe, expect, it, vi } from 'vitest';
import { createActiveForm, type ActiveFormController } from '../src/lib/svelte/active-form/ActiveForm.svelte.js';
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
	it('loads synchronous initial data by value and tracks dirty state deeply', async () => {
		const source = { name: 'initial' };
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialData: () => source
		});

		await expect(form.ready).resolves.toEqual({ name: 'initial' });
		expect(form.data).toEqual({ name: 'initial' });
		expect(form.data).not.toBe(source);
		expect(form.dirty).toBe(false);

		form.data.name = 'changed';
		expect(form.dirty).toBe(true);
		await form.reset('initial');
		expect(form.data).toEqual({ name: 'initial' });
		expect(form.dirty).toBe(false);
	});

	it('starts with empty data and resolves ready when initialData is omitted', async () => {
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));

		await expect(form.ready).resolves.toEqual({});
		expect(form.data).toEqual({});
		expect(form.errors).toEqual({});
		expect(form.pending).toBe(false);
		expect(form.dirty).toBe(false);
	});

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

	it('reloads initial data on demand and clears existing errors', async () => {
		let version = 0;
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialData: () => ({ name: `initial-${++version}` })
		});
		await form.ready;
		form.data.name = 'changed';
		form.errors = { name: 'error' };

		await form.reset('reloadInitial');

		expect(form.data).toEqual({ name: 'initial-2' });
		expect(form.errors).toEqual({});
		expect(form.dirty).toBe(false);
	});

	it('lets beforeSubmit mutate data and abort without calling submit', async () => {
		const onSubmit = vi.fn(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));
		const beforeSubmit = vi.fn(({ form, abort }: { form: ActiveFormController<FormData>; abort: () => void }) => {
			form.data.name = 'prepared';
			abort();
		});
		const form = createActiveForm(onSubmit, {
			initialData: () => ({ name: 'initial' }),
			beforeSubmit
		});
		await form.ready;

		const result = await form.submit();

		expect(beforeSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(result.success).toBe(false);
		expect(form.data).toEqual({ name: 'prepared' });
		expect(form.pending).toBe(false);
	});

	it('calls success callback and applies configured success behavior', async () => {
		const onSuccess = vi.fn(async () => undefined);
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 42 } }), {
			initialData: () => ({ name: 'initial' }),
			onSuccess,
			successBehavior: 'clear'
		});
		await form.ready;
		form.data.name = 'submitted';

		const result = await form.submit();

		expect(result).toEqual({ success: true, response: { id: 42 } });
		expect(onSuccess).toHaveBeenCalledWith({ id: 42 });
		expect(form.data).toEqual({});
		expect(form.errors).toEqual({});
	});

	it('preserves data by default after success while clearing errors', async () => {
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialData: () => ({ name: 'initial' })
		});
		await form.ready;
		form.data.name = 'submitted';
		form.errors = { name: 'old error' };

		await form.submit();

		expect(form.data).toEqual({ name: 'submitted' });
		expect(form.errors).toEqual({});
		expect(form.dirty).toBe(true);
	});

	it('maps validation errors and awaits onError', async () => {
		const onError = vi.fn(async () => undefined);
		const form = createActiveForm(
			async (): Promise<Result> => ({
				success: false,
				response: undefined as never,
				error: { type: ErrorTypes.Schema, message: 'Invalid', external: false, validation: { name: 'Required' } }
			}),
			{ onError }
		);

		await form.submit();

		expect(form.errors).toEqual({ name: 'Required' });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(form.pending).toBe(false);
	});

	it('propagates initialData failures and releases pending state', async () => {
		const failure = new Error('initial failed');
		const onSubmit = vi.fn(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));
		const form = createActiveForm(onSubmit, {
			initialData: async () => {
				throw failure;
			}
		});
		void form.ready.catch(() => undefined);

		await expect(form.submit()).rejects.toBe(failure);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(form.pending).toBe(false);
	});

	it('preserves rich initial values and protects the reset baseline', async () => {
		type RichFormData = {
			createdAt: Date;
			metadata: Map<string, { enabled: boolean }>;
			attachment: Blob;
			optional: undefined;
		};
		type RichResult = AsyncActionResponse<Response, RichFormData>;
		const attachment = new Blob(['document'], { type: 'text/plain' });
		const source: RichFormData = {
			createdAt: new Date('2026-08-13T10:00:00.000Z'),
			metadata: new Map([['settings', { enabled: true }]]),
			attachment,
			optional: undefined
		};
		const form = createActiveForm(async (): Promise<RichResult> => ({ success: true, response: { id: 1 } }), {
			initialData: () => source
		});

		const readyValue = await form.ready;
		source.createdAt.setUTCFullYear(2000);
		source.metadata.get('settings')!.enabled = false;
		readyValue.metadata!.get('settings')!.enabled = false;

		expect(form.data.createdAt).toBeInstanceOf(Date);
		expect(form.data.createdAt!.toISOString()).toBe('2026-08-13T10:00:00.000Z');
		expect(form.data.metadata).toBeInstanceOf(Map);
		expect(form.data.metadata!.get('settings')).toEqual({ enabled: true });
		expect(form.data.attachment).toBe(attachment);
		expect(Object.hasOwn(form.data, 'optional')).toBe(true);

		form.data.metadata!.get('settings')!.enabled = false;
		await form.reset('initial');
		expect(form.data.metadata!.get('settings')!.enabled).toBe(true);
	});
});
