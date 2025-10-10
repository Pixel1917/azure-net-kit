import { ObjectUtil } from 'azure-net-tools';
import type { RequestErrors } from '../../delivery/schema/index.js';
import type { AsyncActionResponse } from '$lib/core/index.js';

export interface FormConfig<FormData, Response> {
	initialData?: Partial<FormData>;
	onSuccess?: (response: Response) => Promise<void> | void;
	onError?: () => Promise<void> | void;
}

export interface ActiveForm<FormData, Response, Custom> {
	data: Partial<FormData>;
	errors: RequestErrors<FormData>;
	submit: () => Promise<AsyncActionResponse<Response, FormData, Custom>>;
	reset: (toInitial?: boolean) => void;
	pending: boolean;
	dirty: boolean;
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

	const initial: Partial<FormData> = config?.initialData ?? {};
	let formData = $state<Partial<FormData>>(ObjectUtil.deepClone(initial));
	let formErrors = $state<RequestErrors<FormData>>({});
	let pending = $state(false);

	const dirty = $derived(JSON.stringify(formData) !== JSON.stringify(initial));

	const submit = async (): Promise<AsyncActionResponse<Response, FormData, Custom>> => {
		pending = true;
		try {
			const result = await onSubmit(ObjectUtil.deepClone(formData, true));

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
		formData = toInitial ? ObjectUtil.deepClone(initial, true) : {};
		formErrors = {};
	};

	return {
		get data() {
			return formData;
		},
		set data(value: Partial<FormData>) {
			formData = value;
		},
		get errors() {
			return formErrors;
		},
		get dirty() {
			return dirty;
		},
		get pending() {
			return pending;
		},
		submit,
		reset
	};
};
