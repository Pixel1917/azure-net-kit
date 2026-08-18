import { BROWSER, ObjectUtil } from '../../external/tools/index.js';
import type { RequestErrors } from '../../delivery/schema/index.js';
import type { AsyncActionResponse } from '../../delivery/injectable-dependencies/AsyncHelpers.js';
import { isAsyncSignalScheduledForClient, type AsyncSignalSvelte, type AsyncStatus } from '../async-signal/AsyncSignal.svelte.js';
import { cloneStateValue } from '../shared/cloneStateValue.js';

type MaybePromise<T> = T | Promise<T>;
const NO_INITIAL_VALUES_ERROR = Symbol('no-initial-values-error');

const isPromiseLike = <T>(value: MaybePromise<T>): value is Promise<T> => {
	return typeof (value as Promise<T>)?.then === 'function';
};

type PathRequiredShape<T, P extends string> = P extends `${infer Head}.${infer Tail}`
	? Head extends keyof T
		? { [K in Head]-?: PathRequiredShape<NonNullable<T[K]>, Tail> }
		: unknown
	: P extends keyof T
		? { [K in P]-?: NonNullable<T[K]> }
		: unknown;

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I : never;

type RequiredByPaths<T, P extends string> = [P] extends [never] ? object : UnionToIntersection<PathRequiredShape<T, P>>;

export type ResetBehaviors = 'clear' | 'initial' | 'reloadInitial' | 'default';
export type ActiveFormStatus = 'idle' | 'waitingForInitialValues' | 'pending' | 'success' | 'error';

export type ActiveFormResponse<Response, FormData, Custom = Record<never, never>> = AsyncActionResponse<Response, FormData, Custom>;

export interface LinkSignalOptions<TValue = unknown, MappedValues = unknown> {
	watch?: boolean;
	mapValues?: (data: TValue | undefined) => MappedValues;
}

export interface LinkPromise<FormData> {
	<TValue extends Partial<FormData>>(source: () => Promise<TValue>): Promise<Partial<FormData>>;
	<TValue>(source: () => Promise<TValue>, map: (value: TValue) => MaybePromise<Partial<FormData>>): Promise<Partial<FormData>>;
}

export interface LinkSignal<FormData> {
	<TValue, MappedValues extends Partial<FormData>>(
		signal: AsyncSignalSvelte<TValue, unknown>,
		options: LinkSignalOptions<TValue, MappedValues> & {
			mapValues: (data: TValue | undefined) => MappedValues;
		}
	): Promise<MappedValues>;
	<TValue extends Partial<FormData>>(
		signal: AsyncSignalSvelte<TValue, unknown>,
		options?: { watch?: boolean; mapValues?: never }
	): Promise<TValue | undefined>;
}

export interface InitialValuesHelpers<FormData> {
	linkPromise: LinkPromise<FormData>;
	linkSignal: LinkSignal<FormData>;
}

type InitialValues<FormData> = (helpers: InitialValuesHelpers<FormData>) => MaybePromise<Partial<FormData> | undefined>;

export interface ActiveForm<FormData, Response, Custom, RequiredPath extends string = never> {
	data: Partial<FormData> & RequiredByPaths<FormData, RequiredPath>;
	errors: RequestErrors<FormData>;
	submit: () => Promise<ActiveFormResponse<Response, FormData, Custom>>;
	reset: (behavior?: ResetBehaviors) => Promise<void>;
	pending: boolean;
	status: ActiveFormStatus;
	dirty: boolean;
}

export interface ActiveFormController<FormData, RequiredPath extends string = never> {
	data: Partial<FormData> & RequiredByPaths<FormData, RequiredPath>;
	errors: RequestErrors<FormData>;
	reset: (behavior?: ResetBehaviors) => Promise<void>;
}

export interface ActiveFormCallbackContext<FormData, Response, Custom, RequiredPath extends string = never> {
	form: ActiveForm<FormData, Response, Custom, RequiredPath>;
	response: ActiveFormResponse<Response, FormData, Custom>;
}

export interface FormConfig<FormData, Response, Custom = Record<never, never>, RequiredPath extends string = never> {
	initialValues?: InitialValues<FormData>;
	required?: readonly RequiredPath[];
	onSuccess?: (context: ActiveFormCallbackContext<FormData, Response, Custom, RequiredPath>) => Promise<void> | void;
	onError?: (context: ActiveFormCallbackContext<FormData, Response, Custom, RequiredPath>) => Promise<void> | void;
	beforeSubmit?: (actions: { form: ActiveFormController<FormData, RequiredPath>; abort: () => void }) => Promise<void> | void;
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

type SignalBinding<FormData> = {
	signal: AsyncSignalSvelte<unknown, unknown>;
	map: (value: unknown) => Partial<FormData>;
	active: boolean;
	loadRunId: number;
	lastData: unknown;
	lastStatus: AsyncStatus;
};

export const createActiveForm = <SubmitReturn extends Promise<AsyncActionResponse<unknown, unknown, unknown>>, RequiredPath extends string = never>(
	onSubmit: (formData: Partial<ExtractFromSubmit<SubmitReturn>['formData']>) => SubmitReturn,
	config?: FormConfig<
		ExtractFromSubmit<SubmitReturn>['formData'],
		ExtractFromSubmit<SubmitReturn>['response'],
		ExtractFromSubmit<SubmitReturn>['custom'],
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
	type FormResponse = ActiveFormResponse<Response, FormData, Custom>;

	let initial: Partial<FormData> = {};
	let formData = $state<FormDataState>(cloneStateValue(initial) as FormDataState);
	let formErrors = $state<RequestErrors<FormData>>({});
	let status = $state<ActiveFormStatus>('idle');
	let signalBindings = $state.raw<SignalBinding<FormData>[]>([]);
	let submitRunId = 0;
	let initialLoadRunId = 0;
	let initialValuesTask: Promise<void> = Promise.resolve();
	let initialValuesError: unknown = NO_INITIAL_VALUES_ERROR;

	let bindingsBySignal: Map<AsyncSignalSvelte<unknown, unknown>, SignalBinding<FormData>> | undefined;
	const dirty = $derived(!ObjectUtil.equals(formData, initial));
	const pending = $derived(status === 'waitingForInitialValues' || status === 'pending');

	const setValues = (values: Partial<FormData>, invalidateSubmission = false) => {
		if (invalidateSubmission) {
			submitRunId += 1;
			status = 'idle';
		}

		initial = cloneStateValue(values);
		formData = cloneStateValue(initial) as FormDataState;
		formErrors = {};
	};

	$effect(() => {
		for (const binding of signalBindings) {
			const status = binding.signal.status;
			const data = binding.signal.response;
			const shouldUpdate = binding.active && status === 'success' && (binding.lastStatus !== 'success' || !Object.is(binding.lastData, data));

			binding.lastStatus = status;
			binding.lastData = data;

			if (shouldUpdate) setValues(binding.map(data), true);
		}
	});

	const loadInitialValues = async (): Promise<void> => {
		const runId = ++initialLoadRunId;
		const source = config?.initialValues;
		let waitingForClientSignal = false;
		initialValuesError = NO_INITIAL_VALUES_ERROR;

		if (!source) {
			bindingsBySignal?.clear();
			bindingsBySignal = undefined;
			signalBindings = [];
			setValues({});
			status = 'idle';
			return;
		}
		try {
			const linkPromise = (async <TValue>(promiseSource: () => Promise<TValue>, map?: (value: TValue) => MaybePromise<Partial<FormData>>) => {
				const value = await promiseSource();
				return map ? await map(value) : (value as Partial<FormData>);
			}) as LinkPromise<FormData>;

			const linkSignal = (async <TValue>(signal: AsyncSignalSvelte<TValue, unknown>, options: LinkSignalOptions<TValue, Partial<FormData>> = {}) => {
				const map = options.mapValues ?? ((value: TValue | undefined) => value as Partial<FormData>);
				let binding: SignalBinding<FormData> | undefined;

				if (options.watch && runId === initialLoadRunId) {
					const untypedSignal = signal as AsyncSignalSvelte<unknown, unknown>;
					const bindings = (bindingsBySignal ??= new Map());
					binding = bindings.get(untypedSignal);
					if (!binding) {
						binding = {
							signal: untypedSignal,
							map: map as (value: unknown) => Partial<FormData>,
							active: false,
							loadRunId: runId,
							lastData: signal.response,
							lastStatus: signal.status
						};
						bindings.set(untypedSignal, binding);
					} else {
						binding.map = map as (value: unknown) => Partial<FormData>;
						binding.active = false;
						binding.loadRunId = runId;
					}
					signalBindings = [...bindings.values()];
				}

				if (!BROWSER && isAsyncSignalScheduledForClient(signal as AsyncSignalSvelte<unknown, unknown>)) {
					waitingForClientSignal = true;
					return undefined;
				}
				if (signal.status === 'idle' || signal.status === 'pending') await signal.ready;
				const value = signal.response;

				if (binding && runId === initialLoadRunId && binding.loadRunId === runId) {
					binding.active = true;
					binding.lastData = value;
					binding.lastStatus = signal.status;
					signalBindings = bindingsBySignal ? [...bindingsBySignal.values()] : [];
				}

				return map(value);
			}) as LinkSignal<FormData>;

			const sourceResult = source({ linkPromise, linkSignal });
			let nextInitial: Partial<FormData> | undefined;
			if (isPromiseLike(sourceResult)) {
				status = 'waitingForInitialValues';
				nextInitial = await sourceResult;
			} else {
				nextInitial = sourceResult;
			}
			if (runId !== initialLoadRunId) return;
			if (waitingForClientSignal) {
				status = 'waitingForInitialValues';
				return;
			}

			if (bindingsBySignal) {
				for (const [signal, binding] of bindingsBySignal) {
					if (binding.loadRunId !== runId) bindingsBySignal.delete(signal);
				}
				if (bindingsBySignal.size === 0) bindingsBySignal = undefined;
			}
			signalBindings = bindingsBySignal ? [...bindingsBySignal.values()] : [];
			setValues(nextInitial ?? {});
			status = 'idle';
		} catch (error) {
			if (runId === initialLoadRunId) {
				initialValuesError = error;
				status = 'error';
			}
			throw error;
		}
	};

	const startInitialValues = () => {
		const task = loadInitialValues();
		initialValuesTask = task.then(
			() => undefined,
			() => undefined
		);
		return task;
	};

	if (config?.initialValues) void startInitialValues();
	const abortedResponse = () =>
		({
			success: false,
			response: undefined as Response
		}) as FormResponse;

	const resetForm = async (behavior: ResetBehaviors = 'clear', invalidateSubmission = true) => {
		if (invalidateSubmission) {
			submitRunId += 1;
			status = 'idle';
		}
		if (behavior !== 'reloadInitial') {
			initialLoadRunId += 1;
			initialValuesTask = Promise.resolve();
			initialValuesError = NO_INITIAL_VALUES_ERROR;
		}

		switch (behavior) {
			case 'clear':
				formData = {} as FormDataState;
				break;
			case 'initial':
				formData = cloneStateValue(initial) as FormDataState;
				break;
			case 'reloadInitial':
				await startInitialValues();
				break;
		}
		formErrors = {};
	};

	const reset = async (behavior: ResetBehaviors = 'clear') => resetForm(behavior, true);

	const submit = async (): Promise<FormResponse> => {
		const runId = ++submitRunId;

		try {
			await initialValuesTask;
			if (runId !== submitRunId) return abortedResponse();
			if (initialValuesError !== NO_INITIAL_VALUES_ERROR) throw initialValuesError;
			status = 'pending';

			if (config?.beforeSubmit) {
				let aborted = false;
				await config.beforeSubmit({
					form: formController,
					abort: () => {
						aborted = true;
					}
				});
				if (aborted) {
					if (runId === submitRunId) status = 'idle';
					return abortedResponse();
				}
				if (runId !== submitRunId) return abortedResponse();
			}

			const result = (await onSubmit(cloneStateValue(formData) as Partial<FormData>)) as FormResponse;
			if (runId !== submitRunId) return result;

			if (result.success) {
				await config?.onSuccess?.({ form: activeForm, response: result });
				if (runId === submitRunId) status = 'success';
			} else {
				if (result.error?.validation) formErrors = result.error.validation as RequestErrors<FormData>;
				await config?.onError?.({ form: activeForm, response: result });
				if (runId === submitRunId) status = 'error';
			}

			return result;
		} catch (error) {
			if (runId === submitRunId) status = 'error';
			throw error;
		}
	};

	const formController: ActiveFormController<FormData, RequiredPath> = {
		get data() {
			return formData;
		},
		set data(value: FormDataState) {
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

	const activeForm: ActiveForm<FormData, Response, Custom, RequiredPath> = {
		get data() {
			return formData;
		},
		set data(value: FormDataState) {
			formData = value;
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
		get status() {
			return status;
		},
		submit,
		reset
	};

	return activeForm;
};
