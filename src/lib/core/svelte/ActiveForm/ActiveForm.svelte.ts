import { ObjectUtil } from '@azure-net/tools';
import type { RequestErrors } from '../../delivery/schema/index.js';
import type { AsyncActionResponse } from '../../delivery/injectableDependencies/AsyncHelpers.js';

type InitialData<FormData, Initial extends Partial<FormData>> = () => Initial | Promise<Initial>;

type PathRequiredShape<T, P extends string> = P extends `${infer Head}.${infer Tail}`
	? Head extends keyof T
		? { [K in Head]-?: PathRequiredShape<NonNullable<T[K]>, Tail> }
		: unknown
	: P extends keyof T
		? { [K in P]-?: NonNullable<T[K]> }
		: unknown;

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I : never;

type RequiredByPaths<T, P extends string> = [P] extends [never] ? object : UnionToIntersection<PathRequiredShape<T, P>>;

type ResetBehaviors = 'clear' | 'initial' | 'reloadInitial' | 'default';

export interface FormConfig<FormData, Response, Initial extends Partial<FormData> = Partial<FormData>, RequiredPath extends string = never> {
	initialData?: InitialData<FormData, Initial>;
	required?: readonly RequiredPath[];
	onSuccess?: (response: Response) => Promise<void> | void;
	onError?: () => Promise<void> | void;
	beforeSubmit?: (actions: { form: ActiveFormController<FormData, RequiredPath>; abort: () => void }) => Promise<void> | void;
	successBehavior?: ResetBehaviors;
}

export interface ActiveForm<FormData, Response, Custom, RequiredPath extends string = never> {
	data: Partial<FormData> & RequiredByPaths<FormData, RequiredPath>;
	errors: RequestErrors<FormData>;
	submit: () => Promise<AsyncActionResponse<Response, FormData, Custom>>;
	reset: (behavior?: ResetBehaviors) => Promise<void>;
	pending: boolean;
	dirty: boolean;
	ready: Promise<Partial<FormData>>;
}

export interface ActiveFormController<FormData, RequiredPath extends string = never> {
	data: Partial<FormData> & RequiredByPaths<FormData, RequiredPath>;
	errors: RequestErrors<FormData>;
	reset: (behavior?: ResetBehaviors) => Promise<void>;
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

export const createActiveForm = <SubmitReturn extends Promise<AsyncActionResponse<unknown, unknown, unknown>>, RequiredPath extends string = never>(
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

	let initial: Partial<FormData> = {};

	let formData = $state<FormDataState>(ObjectUtil.deepClone(initial) as FormDataState);
	let formErrors = $state<RequestErrors<FormData>>({});
	let pending = $state(false);

	const dirty = $derived(!ObjectUtil.equals(formData, initial));

	const loadInitialData = async (): Promise<Partial<FormData>> => {
		const source = config?.initialData;

		if (!source) {
			initial = {};
			formData = ObjectUtil.deepClone(initial) as FormDataState;
			formErrors = {};
			return initial;
		}

		const value = source();
		const nextInitial = isPromise(value) ? await value : value;

		initial = (nextInitial ?? {}) as Partial<FormData>;
		formData = ObjectUtil.deepClone(initial) as FormDataState;
		formErrors = {};

		return initial;
	};

	const ready: Promise<Partial<FormData>> = loadInitialData();

	const submit = async (): Promise<AsyncActionResponse<Response, FormData, Custom>> => {
		pending = true;

		try {
			if (config?.beforeSubmit) {
				let aborted = false;
				const abort = () => {
					aborted = true;
					pending = false;
				};
				await config.beforeSubmit({ form: formApi, abort: () => abort() });
				if (aborted) {
					return {
						success: false,
						response: undefined as Response
					} as AsyncActionResponse<Response, FormData, Custom>;
				}
			}

			const result = await onSubmit($state.snapshot(formData) as Partial<ExtractFromSubmit<SubmitReturn>['formData']>);

			if (result.success) {
				await config?.onSuccess?.(result.response as Response);
				await reset(config?.successBehavior ?? 'default');
			} else {
				if (result.error?.validation) {
					formErrors = result.error.validation as RequestErrors<FormData>;
				}
				await config?.onError?.();
			}

			return result as AsyncActionResponse<Response, FormData, Custom>;
		} finally {
			pending = false;
		}
	};

	const reset = async (behavior: ResetBehaviors = 'clear') => {
		switch (behavior) {
			case 'clear':
				formData = {} as FormDataState;
				break;
			case 'initial':
				formData = ObjectUtil.deepClone(initial) as FormDataState;
				break;
			case 'reloadInitial':
				await loadInitialData();
				break;
		}
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
		submit,
		ready,
		reset
	};
};
