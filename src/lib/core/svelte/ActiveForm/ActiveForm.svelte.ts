import { ObjectUtil } from 'azure-net-tools';
import type { RequestErrors } from '../../delivery/schema/index.js';
import type { AsyncActionResponse } from '$lib/core/index.js';

export interface FormConfig<FormData, Response> {
	onSubmit: (formData: Partial<FormData>) => Promise<AsyncActionResponse<Response, FormData>>;
	initialData?: FormData;
}

export interface ActiveForm<FormData, Response> {
	data: Partial<FormData>;
	errors: RequestErrors<FormData>;
	submit: () => Promise<AsyncActionResponse<Response, FormData>>;
	reset: () => void;
	pending: boolean;
	dirty: boolean;
}

export const createActiveForm = <FormData, Response = unknown>(config: FormConfig<FormData, Response>): ActiveForm<FormData, Response> => {
	const initial: Partial<FormData> = config.initialData ?? {};
	let formData = $state<Partial<FormData>>(ObjectUtil.deepClone(initial));
	let formErrors = $state<RequestErrors<FormData>>({});

	let pending = $state(false);

	const dirty = $derived(JSON.stringify(formData) !== JSON.stringify(initial));

	const submit = async () => {
		pending = true;
		const result = await config.onSubmit(formData);
		if (result.error?.fields) {
			formErrors = result.error?.fields;
		}
		pending = false;
		return result;
	};

	const reset = (toInitial = false) => {
		formData = toInitial ? ObjectUtil.deepClone(initial) : {};
		formErrors = {};
	};

	return {
		get data() {
			return formData;
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
