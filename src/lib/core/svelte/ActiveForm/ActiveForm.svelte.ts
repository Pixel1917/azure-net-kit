import { ObjectUtil } from 'azure-net-tools';
import type { RequestErrors, Schema } from '../../delivery/schema/index.js';

export interface FormConfig<T, D> {
	onSubmit: (data: T) => Promise<void> | void;
	initialData?: T;
	schema?: D;
	validateOnChange?: boolean;
}

export interface ActiveForm<T> {
	data: Partial<T>;
	//errors: RequestErrors<T>;
	submit: () => Promise<void>;
	reset: () => void;
	pending: boolean;
	dirty: boolean;
}

export const createActiveForm = <T extends object, D extends Schema<unknown, unknown, unknown>>(config: FormConfig<T, D>) => {
	const initial: Partial<T> = config.initialData ?? {};
	let formData = $state<Partial<T>>(ObjectUtil.deepClone(initial));
	let formErrors = $state<RequestErrors<T>>({});

	//let pending = $state(false);

	const dirty = $derived(JSON.stringify(formData) !== JSON.stringify(initial));

	// const validate = () => {};
	//
	// const submit = async () => {
	// 	pending = true;
	// };

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
		// get pending() {
		// 	return pending;
		// },
		reset
	};
};

// export function createActiveForm<T extends object>(config: FormConfig<T>): ActiveForm<T> {
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
// }
//
