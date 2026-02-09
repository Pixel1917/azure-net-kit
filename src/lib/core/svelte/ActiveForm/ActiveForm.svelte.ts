import { ObjectUtil } from 'azure-net-tools';
import type { RequestErrors } from '../../delivery/schema/index.js';
import type { AsyncActionResponse } from '$lib/core/index.js';

type InitialData<FormData> = Partial<FormData> | Promise<Partial<FormData>> | (() => Partial<FormData> | Promise<Partial<FormData>>);

export interface FormConfig<FormData, Response> {
	initialData?: InitialData<FormData>;
	onSuccess?: (response: Response) => Promise<void> | void;
	onError?: () => Promise<void> | void;
	beforeSubmit?: (form: ActiveFormController<FormData>, abort: () => void) => Promise<void> | void;
	waitForInitialData?: boolean;
}

export interface ActiveForm<FormData, Response, Custom> {
	data: Partial<FormData>;
	errors: RequestErrors<FormData>;
	submit: () => Promise<AsyncActionResponse<Response, FormData, Custom>>;
	reset: (toInitial?: boolean) => void;
	pending: boolean;
	dirty: boolean;
	ready: Promise<Partial<FormData>>;
}

export interface ActiveFormController<FormData> {
	data: Partial<FormData>;
	errors: RequestErrors<FormData>;
	reset: (toInitial?: boolean) => void;
}

type ExtractResponse<T> = T extends AsyncActionResponse<infer R, unknown, unknown> ? R : never;
type ExtractFormData<T> = T extends AsyncActionResponse<unknown, infer D, unknown> ? D : never;
type ExtractCustom<T> = T extends AsyncActionResponse<unknown, unknown, infer C> ? C : never;

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

type ExtractFromSubmit<T> = {
	response: ExtractResponse<UnwrapPromise<T>>;
	formData: ExtractFormData<UnwrapPromise<T>>;
	custom: ExtractCustom<UnwrapPromise<T>>;
};

export const createActiveForm = <SubmitReturn extends Promise<AsyncActionResponse<unknown, unknown, unknown>>>(
	onSubmit: (formData: Partial<ExtractFromSubmit<SubmitReturn>['formData']>) => SubmitReturn,
	config?: FormConfig<ExtractFromSubmit<SubmitReturn>['formData'], ExtractFromSubmit<SubmitReturn>['response']>
): ActiveForm<
	ExtractFromSubmit<SubmitReturn>['formData'],
	ExtractFromSubmit<SubmitReturn>['response'],
	ExtractFromSubmit<SubmitReturn>['custom']
> => {
	type FormData = ExtractFromSubmit<SubmitReturn>['formData'];
	type Response = ExtractFromSubmit<SubmitReturn>['response'];
	type Custom = ExtractFromSubmit<SubmitReturn>['custom'];

	const isPromise = <T>(value: T | Promise<T>): value is Promise<T> => {
		return typeof (value as Promise<T>)?.then === 'function';
	};

	const resolveInitialSource = () => {
		const source = config?.initialData;
		if (!source) {
			return { sync: true as const, value: {} as Partial<FormData> };
		}
		const result = typeof source === 'function' ? source() : source;
		if (isPromise(result)) {
			return { sync: false as const, promise: result };
		}
		return { sync: true as const, value: (result ?? {}) as Partial<FormData> };
	};

	const initialSource = resolveInitialSource();
	let initial: Partial<FormData> = initialSource.sync ? initialSource.value : {};

	let formData = $state<Partial<FormData>>(ObjectUtil.deepClone(initial));
	let formErrors = $state<RequestErrors<FormData>>({});
	let pending = $state(false);

	const dirty = $derived(JSON.stringify(formData) !== JSON.stringify(initial));

	const ready = (async (): Promise<Partial<FormData>> => {
		if (!initialSource.sync) {
			initial = (await initialSource.promise) ?? {};
			if (config?.waitForInitialData !== false) {
				formData = ObjectUtil.deepClone(initial);
			}
		}
		return initial;
	})();

	const submit = async (): Promise<AsyncActionResponse<Response, FormData, Custom>> => {
		pending = true;
		if (config?.beforeSubmit) {
			let aborted = false;
			const abort = () => {
				aborted = true;
				pending = false;
			};
			await config.beforeSubmit(formApi, () => abort());
			if (aborted) {
				return {
					success: false,
					response: undefined as Response
				} as AsyncActionResponse<Response, FormData, Custom>;
			}
		}
		try {
			const result = await onSubmit($state.snapshot(formData) as Partial<ExtractFromSubmit<SubmitReturn>['formData']>);

			if (result.error?.fields) {
				formErrors = result.error.fields as RequestErrors<FormData>;
			}

			if (result.success) {
				await config?.onSuccess?.(result.response as Response);
			} else {
				await config?.onError?.();
			}

			return result as Promise<AsyncActionResponse<Response, FormData, Custom>>;
		} finally {
			pending = false;
		}
	};

	const reset = (toInitial = false) => {
		formData = toInitial ? ObjectUtil.deepClone(initial) : {};
		formErrors = {};
	};

	const formApi: ActiveFormController<FormData> = {
		get data() {
			return formData;
		},
		set data(value: Partial<FormData>) {
			formData = value;
		},
		get errors() {
			return formErrors;
		},
		set errors(value: RequestErrors<FormData>) {
			formErrors = value;
		},
		reset
	};

	return {
		...formApi,
		get dirty() {
			return dirty;
		},
		get pending() {
			return pending;
		},
		ready,
		submit,
		reset
	};
};
