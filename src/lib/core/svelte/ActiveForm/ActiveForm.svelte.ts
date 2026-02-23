import { ObjectUtil } from 'azure-net-tools';
import type { RequestErrors } from '../../delivery/schema/index.js';
import type { AsyncActionResponse } from '$lib/core/index.js';

type InitialData<FormData, Initial extends Partial<FormData>> =
	| Initial
	| Promise<Initial>
	| (() => Initial | Promise<Initial>);

type PathRequiredShape<T, P extends string> = P extends `${infer Head}.${infer Tail}`
	? Head extends keyof T
		? { [K in Head]-?: PathRequiredShape<NonNullable<T[K]>, Tail> }
		: unknown
	: P extends keyof T
		? { [K in P]-?: NonNullable<T[K]> }
		: unknown;

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I : never;

type RequiredByPaths<T, P extends string> = [P] extends [never] ? {} : UnionToIntersection<PathRequiredShape<T, P>>;

export interface FormConfig<
	FormData,
	Response,
	Initial extends Partial<FormData> = Partial<FormData>,
	RequiredPath extends string = never
> {
	initialData?: InitialData<FormData, Initial>;
	required?: readonly RequiredPath[];
	onSuccess?: (response: Response) => Promise<void> | void;
	onError?: () => Promise<void> | void;
	beforeSubmit?: (form: ActiveFormController<FormData, RequiredPath>, abort: () => void) => Promise<void> | void;
	waitForInitialData?: boolean;
}

export interface ActiveForm<FormData, Response, Custom, RequiredPath extends string = never> {
	data: Partial<FormData> & RequiredByPaths<FormData, RequiredPath>;
	errors: RequestErrors<FormData>;
	submit: () => Promise<AsyncActionResponse<Response, FormData, Custom>>;
	reset: (toInitial?: boolean) => void;
	pending: boolean;
	dirty: boolean;
	ready: Promise<Partial<FormData>>;
}

export interface ActiveFormController<FormData, RequiredPath extends string = never> {
	data: Partial<FormData> & RequiredByPaths<FormData, RequiredPath>;
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

export const createActiveForm = <
	SubmitReturn extends Promise<AsyncActionResponse<unknown, unknown, unknown>>,
	RequiredPath extends string = never
>(
	onSubmit: (formData: Partial<ExtractFromSubmit<SubmitReturn>['formData']>) => SubmitReturn,
	config?: FormConfig<
		ExtractFromSubmit<SubmitReturn>['formData'],
		ExtractFromSubmit<SubmitReturn>['response'],
		Partial<ExtractFromSubmit<SubmitReturn>['formData']>,
		RequiredPath
	>
): ActiveForm<
	ExtractFromSubmit<SubmitReturn>['formData'],
	ExtractFromSubmit<SubmitReturn>['response'],
	ExtractFromSubmit<SubmitReturn>['custom'],
	RequiredPath
> => {
	type FormData = ExtractFromSubmit<SubmitReturn>['formData'];
	type Response = ExtractFromSubmit<SubmitReturn>['response'];
	type Custom = ExtractFromSubmit<SubmitReturn>['custom'];
	type FormDataState = Partial<FormData> & RequiredByPaths<FormData, RequiredPath>;

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

	let formData = $state<FormDataState>(ObjectUtil.deepClone(initial) as FormDataState);
	let formErrors = $state<RequestErrors<FormData>>({});
	let pending = $state(false);

	const dirty = $derived(JSON.stringify(formData) !== JSON.stringify(initial));

	const ready = (async (): Promise<Partial<FormData>> => {
		if (!initialSource.sync) {
			initial = (await initialSource.promise) ?? {};
			if (config?.waitForInitialData !== false) {
				formData = ObjectUtil.deepClone(initial) as FormDataState;
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
		formData = toInitial ? (ObjectUtil.deepClone(initial) as FormDataState) : ({} as FormDataState);
		formErrors = {};
	};

	const formApi: ActiveFormController<FormData, RequiredPath> = {
		get data() {
			return formData;
		},
		set data(value: FormDataState) {
			formData = value as FormDataState;
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
		get data() {
			return formData;
		},
		set data(value: FormDataState) {
			formData = value as FormDataState;
		},
		get errors() {
			return formErrors;
		},
		set errors(value: RequestErrors<FormData>) {
			formErrors = value;
		},
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
