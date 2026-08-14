import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createActiveForm, type ActiveFormCallbackContext, type ActiveFormController } from '../src/lib/svelte/active-form/ActiveForm.svelte.js';
import { ErrorTypes } from '../src/lib/shared/app-error/AppError.js';
import type { AsyncActionResponse } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import type { AsyncSignalSvelte, AsyncStatus } from '../src/lib/svelte/async-signal/AsyncSignal.svelte.js';

type FormData = { name: string };
type Response = { id: number };
type Result = AsyncActionResponse<Response, FormData>;

const createDeferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((next, fail) => {
		resolve = next;
		reject = fail;
	});
	return { promise, reject, resolve };
};

const waitForStatus = async (form: { status: string }, status: string) => {
	await vi.waitFor(() => expect(form.status).toBe(status));
};

describe('createActiveForm', () => {
	it('loads synchronous initial data by value and tracks dirty state deeply', async () => {
		const source = { name: 'initial' };
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: () => source
		});

		expect(form.status).toBe('idle');
		expect(form.pending).toBe(false);
		expect(form.data).toEqual({ name: 'initial' });
		expect(form.data).not.toBe(source);
		expect(form.dirty).toBe(false);

		form.data.name = 'changed';
		expect(form.dirty).toBe(true);
		await form.reset('initial');
		expect(form.data).toEqual({ name: 'initial' });
		expect(form.dirty).toBe(false);
	});

	it('starts idle with empty data when initialValues is omitted', async () => {
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));

		expect(form.status).toBe('idle');
		expect(form.data).toEqual({});
		expect(form.errors).toEqual({});
		expect(form.pending).toBe(false);
		expect(form.dirty).toBe(false);
	});

	it('waits for initialValues before submitting', async () => {
		const initial = createDeferred<Partial<FormData>>();
		const onSubmit = vi.fn(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));
		const form = createActiveForm(onSubmit, {
			initialValues: () => initial.promise
		});

		const submission = form.submit();
		expect(form.pending).toBe(true);
		expect(form.status).toBe('waitingForInitialValues');
		expect(onSubmit).not.toHaveBeenCalled();

		initial.resolve({ name: 'ready' });
		await submission;

		expect(onSubmit).toHaveBeenCalledWith({ name: 'ready' });
		expect(form.pending).toBe(false);
		expect(form.status).toBe('success');
	});

	it('allows only the latest submission to update form state', async () => {
		const first = createDeferred<Result>();
		const second = createDeferred<Result>();
		const onSubmit = vi.fn<(formData: Partial<FormData>) => Promise<Result>>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const form = createActiveForm(onSubmit, {
			initialValues: () => ({ name: 'initial' })
		});
		await waitForStatus(form, 'idle');

		form.data = { name: 'first' };
		const firstSubmission = form.submit();
		await Promise.resolve();
		expect(form.status).toBe('pending');
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
			initialValues: () => ({ name: 'initial' })
		});
		await waitForStatus(form, 'idle');

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

	it('does not let pending initialValues overwrite an explicit reset', async () => {
		const initial = createDeferred<Partial<FormData>>();
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: () => initial.promise
		});

		await form.reset('clear');
		initial.resolve({ name: 'stale initial' });
		await Promise.resolve();
		await Promise.resolve();

		expect(form.data).toEqual({});
	});

	it('reloads initial data on demand and clears existing errors', async () => {
		let version = 0;
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: () => ({ name: `initial-${++version}` })
		});
		await waitForStatus(form, 'idle');
		form.data.name = 'changed';
		form.errors = { name: 'error' };

		await form.reset('reloadInitial');

		expect(form.data).toEqual({ name: 'initial-2' });
		expect(form.errors).toEqual({});
		expect(form.dirty).toBe(false);
	});

	it('reports reloadInitial as waiting for initial values', async () => {
		const reloaded = createDeferred<Partial<FormData>>();
		let loadCount = 0;
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: () => (++loadCount === 1 ? { name: 'initial' } : reloaded.promise)
		});
		await waitForStatus(form, 'idle');

		const reset = form.reset('reloadInitial');
		expect(form.status).toBe('waitingForInitialValues');
		expect(form.pending).toBe(true);
		reloaded.resolve({ name: 'reloaded' });
		await reset;

		expect(form.status).toBe('idle');
		expect(form.pending).toBe(false);
		expect(form.data).toEqual({ name: 'reloaded' });
	});

	it('applies only the latest concurrent reloadInitial result', async () => {
		const firstReload = createDeferred<Partial<FormData>>();
		const secondReload = createDeferred<Partial<FormData>>();
		let loadCount = 0;
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: () => {
				loadCount += 1;
				if (loadCount === 1) return { name: 'initial' };
				return loadCount === 2 ? firstReload.promise : secondReload.promise;
			}
		});
		await waitForStatus(form, 'idle');

		const firstReset = form.reset('reloadInitial');
		const secondReset = form.reset('reloadInitial');
		secondReload.resolve({ name: 'latest' });
		await secondReset;
		firstReload.resolve({ name: 'stale' });
		await firstReset;

		expect(form.data).toEqual({ name: 'latest' });
		expect(form.status).toBe('idle');
	});

	it('recovers from an initial values failure through reloadInitial', async () => {
		const failure = new Error('initial failed');
		let loadCount = 0;
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: async () => {
				if (++loadCount === 1) throw failure;
				return { name: 'recovered' };
			}
		});
		await waitForStatus(form, 'error');

		await form.reset('reloadInitial');

		expect(form.data).toEqual({ name: 'recovered' });
		expect(form.status).toBe('idle');
		expect(form.pending).toBe(false);
	});

	it('ignores a stale initial values rejection after an explicit reset', async () => {
		const initial = createDeferred<Partial<FormData>>();
		const onSubmit = vi.fn(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));
		const form = createActiveForm(onSubmit, { initialValues: () => initial.promise });

		await form.reset('clear');
		initial.reject(new Error('stale failure'));
		await Promise.resolve();
		await Promise.resolve();
		await form.submit();

		expect(onSubmit).toHaveBeenCalledWith({});
		expect(form.status).toBe('success');
	});

	it('links a promise and maps its resolved value into initial values', async () => {
		const user = createDeferred<{ profile: { displayName: string } }>();
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: ({ linkPromise }) =>
				linkPromise(
					() => user.promise,
					(value) => ({ name: value.profile.displayName })
				)
		});

		user.resolve({ profile: { displayName: 'Linked user' } });

		await waitForStatus(form, 'idle');
		expect(form.data).toEqual({ name: 'Linked user' });
	});

	it('links a pending signal, waits for ready and maps signal data', async () => {
		type User = { login: string };
		const request = createDeferred<User | undefined>();
		let status: AsyncStatus = 'pending';
		let data: User | undefined;
		const ready = request.promise.then((value) => {
			data = value;
			status = 'success';
			return value;
		});
		const signal: AsyncSignalSvelte<User, unknown> = {
			get data() {
				return data;
			},
			get error() {
				return undefined;
			},
			get status() {
				return status;
			},
			get pending() {
				return status === 'pending';
			},
			ready,
			execute: vi.fn(),
			refresh: vi.fn(),
			reset: vi.fn(),
			abort: vi.fn()
		};
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: ({ linkSignal }) => {
				const linkedValues = linkSignal(signal, {
					mapValues: (value) => ({ name: value?.login ?? '' })
				});
				expectTypeOf(linkedValues).toEqualTypeOf<Promise<{ name: string }>>();
				return linkedValues;
			}
		});

		request.resolve({ login: 'sergey' });

		await waitForStatus(form, 'idle');
		expect(form.data).toEqual({ name: 'sergey' });
	});

	it('uses the whole signal data and does not restart an already ready signal', async () => {
		let readyReads = 0;
		const signal: AsyncSignalSvelte<FormData, unknown> = {
			data: { name: 'ready signal' },
			error: undefined,
			status: 'success',
			pending: false,
			get ready() {
				readyReads += 1;
				return Promise.reject(new Error('ready must not be read for a completed signal'));
			},
			execute: vi.fn(),
			refresh: vi.fn(),
			reset: vi.fn(),
			abort: vi.fn()
		};
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: ({ linkSignal }) => {
				const linkedValues = linkSignal(signal);
				expectTypeOf(linkedValues).toEqualTypeOf<Promise<FormData | undefined>>();
				return linkedValues;
			}
		});

		await waitForStatus(form, 'idle');
		expect(form.data).toEqual({ name: 'ready signal' });
		expect(readyReads).toBe(0);
	});

	it('lets beforeSubmit mutate data and abort without calling submit', async () => {
		const onSubmit = vi.fn(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));
		const beforeSubmit = vi.fn(({ form, abort }: { form: ActiveFormController<FormData>; abort: () => void }) => {
			form.data.name = 'prepared';
			abort();
		});
		const form = createActiveForm(onSubmit, {
			initialValues: () => ({ name: 'initial' }),
			beforeSubmit
		});
		await waitForStatus(form, 'idle');

		const result = await form.submit();

		expect(beforeSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(result.success).toBe(false);
		expect(form.data).toEqual({ name: 'prepared' });
		expect(form.pending).toBe(false);
		expect(form.status).toBe('idle');
	});

	it('passes the full response and form to onSuccess and lets the callback choose reset behavior', async () => {
		const onSuccess = vi.fn(async ({ form }: ActiveFormCallbackContext<FormData, Response, Record<never, never>>) => form.reset('clear'));
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 42 } }), {
			initialValues: () => ({ name: 'initial' }),
			onSuccess
		});
		await waitForStatus(form, 'idle');
		form.data.name = 'submitted';

		const result = await form.submit();

		expect(result).toEqual({ success: true, response: { id: 42 } });
		expect(onSuccess).toHaveBeenCalledWith({ form, response: result });
		expect(form.data).toEqual({});
		expect(form.errors).toEqual({});
		expect(form.status).toBe('idle');
	});

	it('does not mutate form state automatically after success', async () => {
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), {
			initialValues: () => ({ name: 'initial' })
		});
		await waitForStatus(form, 'idle');
		form.data.name = 'submitted';
		form.errors = { name: 'old error' };

		await form.submit();

		expect(form.data).toEqual({ name: 'submitted' });
		expect(form.errors).toEqual({ name: 'old error' });
		expect(form.dirty).toBe(true);
		expect(form.status).toBe('success');
	});

	it('keeps pending true until an asynchronous submit callback finishes', async () => {
		const callback = createDeferred<void>();
		const onSuccess = vi.fn(() => callback.promise);
		const form = createActiveForm(async (): Promise<Result> => ({ success: true, response: { id: 1 } }), { onSuccess });

		const submission = form.submit();
		await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
		expect(form.status).toBe('pending');
		expect(form.pending).toBe(true);
		callback.resolve();
		await submission;

		expect(form.status).toBe('success');
		expect(form.pending).toBe(false);
	});

	it('moves to error and releases pending when submit throws', async () => {
		const failure = new Error('request failed');
		const form = createActiveForm(async (): Promise<Result> => {
			throw failure;
		});

		await expect(form.submit()).rejects.toBe(failure);

		expect(form.status).toBe('error');
		expect(form.pending).toBe(false);
	});

	it('maps validation errors and passes the full response and form to onError', async () => {
		const onError = vi.fn(async () => undefined);
		const form = createActiveForm(
			async (): Promise<Result> => ({
				success: false,
				response: undefined as never,
				error: { type: ErrorTypes.Schema, message: 'Invalid', external: false, validation: { name: 'Required' } }
			}),
			{ onError }
		);

		const result = await form.submit();

		expect(form.errors).toEqual({ name: 'Required' });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith({ form, response: result });
		expect(form.pending).toBe(false);
		expect(form.status).toBe('error');
	});

	it('propagates initialValues failures and releases pending state', async () => {
		const failure = new Error('initial failed');
		const onSubmit = vi.fn(async (): Promise<Result> => ({ success: true, response: { id: 1 } }));
		const form = createActiveForm(onSubmit, {
			initialValues: async () => {
				throw failure;
			}
		});
		await expect(form.submit()).rejects.toBe(failure);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(form.pending).toBe(false);
		expect(form.status).toBe('error');
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
			initialValues: () => source
		});

		await waitForStatus(form, 'idle');
		source.createdAt.setUTCFullYear(2000);
		source.metadata.get('settings')!.enabled = false;

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
