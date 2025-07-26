import { type RequestErrors, BaseRequest } from '../../core/index.js';

export interface FormConfig<T> {
	onSubmit: (data: T) => Promise<void> | void;
	initialData?: T;
	validation?: {
		schema?: new (data: Partial<T>) => BaseRequest<T, T>;
		validateOnChange?: boolean;
		validateOnBlur?: boolean;
	};
}

export interface ActiveForm<T> {
	data: Partial<T>;
	errors: RequestErrors<T>;
	touched: Partial<Record<keyof T, boolean>>;
	pending: boolean;
	dirty: boolean;
	valid: boolean;

	submit: () => Promise<void>;
	validate: (field?: keyof T) => void;
	reset: () => void;
	setField: <K extends keyof T>(field: K, value: T[K]) => void;
	setErrors: (errors: RequestErrors<T>) => void;
	touchField: (field: keyof T) => void;
}

// export function createActiveForm<T extends object>(config: FormConfig<T>): ActiveForm<T> {
// 	const initial: Partial<T> = config.initialData ?? {};
// 	let data = $state<Partial<T>>(structuredClone(initial));
// 	let errors = $state<RequestErrors<T>>({});
// 	let touched = $state<Partial<Record<keyof T, boolean>>>({});
// 	let pending = $state(false);
//
// 	const dirty = $derived(JSON.stringify(data) !== JSON.stringify(config.initialData));
//
// 	const valid = $derived(() => {
// 		if (Object.keys(errors).length > 0) return false;
//
// 		if (config.validation?.schema) {
// 			try {
// 				const request = new config.validation.schema(data);
// 				request.validated();
// 				return true;
// 			} catch {
// 				return false;
// 			}
// 		}
//
// 		return true;
// 	});
//
// 	function validateForm(): boolean {
// 		if (!config.validation?.schema) return true;
//
// 		try {
// 			const request = new config.validation.schema(data);
// 			request.validated();
// 			errors = {};
// 			return true;
// 		} catch (error) {
// 			if (error instanceof config.validation.schema) {
// 				errors = error.getErrors();
// 				return false;
// 			}
// 			throw error;
// 		}
// 	}
//
// 	function validateField(field: keyof T): void {
// 		if (!config.validation?.schema) return;
//
// 		try {
// 			const request = new config.validation.schema(data);
// 			request.validated();
//
// 			const newErrors = { ...errors };
// 			delete newErrors[field];
// 			errors = newErrors;
// 		} catch (error) {
// 			if (error instanceof config.validation.schema) {
// 				const allErrors = error.getErrors();
// 				if (field in allErrors) {
// 					errors = { ...errors, [field]: allErrors[field] };
// 				} else {
// 					const newErrors = { ...errors };
// 					delete newErrors[field];
// 					errors = newErrors;
// 				}
// 			}
// 		}
// 	}
//
// 	if (config.validation?.validateOnChange) {
// 		$effect(() => {
// 			JSON.stringify(data);
//
// 			const touchedFields = Object.keys(touched) as (keyof T)[];
// 			if (touchedFields.length > 0) {
// 				touchedFields.forEach((field) => {
// 					if (touched[field]) {
// 						validateField(field);
// 					}
// 				});
// 			}
// 		});
// 	}
//
// 	async function submit(): Promise<void> {
// 		pending = true;
//
// 		try {
// 			if (!validateForm()) {
// 				return;
// 			}
//
// 			errors = {};
//
// 			await config.onSubmit(data);
// 		} catch (error) {
// 			throw error;
// 		} finally {
// 			pending = false;
// 		}
// 	}
//
// 	function setField<K extends keyof T>(field: K, value: T[K]): void {
// 		data = { ...data, [field]: value };
// 		touched = { ...touched, [field]: true };
//
// 		if (config.validation?.validateOnBlur && touched[field]) {
// 			validateField(field);
// 		}
// 	}
//
// 	function touchField(field: keyof T): void {
// 		touched = { ...touched, [field]: true };
//
// 		if (config.validation?.validateOnBlur) {
// 			validateField(field);
// 		}
// 	}
//
// 	function reset(): void {
// 		data = structuredClone(config.initialData);
// 		errors = {};
// 		touched = {};
// 	}
//
// 	return {
// 		get data() {
// 			return data;
// 		},
// 		get errors() {
// 			return errors;
// 		},
// 		get touched() {
// 			return touched;
// 		},
// 		get pending() {
// 			return pending;
// 		},
// 		get dirty() {
// 			return dirty;
// 		},
// 		get valid() {
// 			return valid();
// 		},
//
// 		submit,
// 		validate: (field?: keyof T) => {
// 			if (field) {
// 				validateField(field);
// 			} else {
// 				validateForm();
// 			}
// 		},
// 		reset,
// 		setField,
// 		setErrors: (newErrors: RequestErrors<T>) => {
// 			errors = newErrors;
// 		},
// 		touchField
// 	};
// }
//
// function structuredClone<T>(obj: T): T {
// 	return JSON.parse(JSON.stringify(obj));
// }
