import { FormDataUtil } from 'azure-net-tools';

type DeepKeys<T> = T extends object
	? {
			[K in keyof T & string]: T[K] extends object ? K | `${K}.${DeepKeys<T[K]>}` : K;
		}[keyof T & string]
	: never;

export type ValidationParams<T = unknown, V = unknown, K = string> = {
	val: V;
	listValues?: Partial<T>;
	key?: K;
};

export type ValidationMessage = string | { key: string; vars?: Record<string, unknown> };

export interface ValidationErrorsMap {
	[key: string]: ValidationMessage | ValidationErrorsMap;
}

export type ValidationResult = ValidationMessage | ValidationErrorsMap | ValidationErrorsMap[] | undefined;

export type ValidationRuleResult<CurrentValue, ListValues = unknown, CurrentKey = string> = (
	params: ValidationParams<CurrentValue, ListValues, CurrentKey>
) => ValidationResult;

type ValidationErrors<T> =
	T extends ReadonlyArray<infer U> ? ValidationErrors<U>[] : T extends object ? { [K in keyof T]?: ValidationErrors<T[K]> } : ValidationMessage;

export type RequestErrors<Dict> = Partial<ValidationErrors<Dict>>;

export type RequestRules<D> = Partial<Record<DeepKeys<D>, ValidationRuleResult<D>[]>>;

export interface IRequest<T, D = T> {
	rules?(): RequestRules<D>;
}

export class BaseRequest<T, D = T> implements IRequest<T, D> {
	data: D;
	errors: RequestErrors<D> = {};
	isValid = true;

	constructor(data: Partial<D> | FormData) {
		this.data = this.prepareData(data);
	}

	rules(): RequestRules<D> {
		return {};
	}

	private prepareData(data: Partial<D> | FormData) {
		if (data instanceof FormData) {
			return FormDataUtil.toObject<D>(data);
		}
		return data as D;
	}

	transform(data: D) {
		return data as unknown as T;
	}

	formData() {
		this.validated();
		return FormDataUtil.fromObject(this.transform(this.data));
	}

	json() {
		this.validated();
		return this.transform(this.data);
	}

	getErrors() {
		return this.errors;
	}

	private getByPath<P extends DeepKeys<D>>(path: P): unknown {
		return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), this.data as unknown);
	}

	private setByPath<P extends DeepKeys<D>>(obj: object, path: P, value: unknown): void {
		const keys = path.split('.');
		let current = obj as object;
		for (let i = 0; i < keys.length - 1; i++) {
			const k = keys[i];
			if (!(k in current) || typeof current[k as keyof typeof current] !== 'object') {
				current[k as keyof typeof current] = {} as never;
			}
			current = current[k as keyof typeof current];
		}
		current[keys[(keys.length - 1) as keyof typeof keys] as keyof typeof current] = value as never;
	}

	validated() {
		this.isValid = true;
		this.errors = {};
		const definedRules = this.rules();

		for (const key in definedRules) {
			const fieldRules = definedRules[key as DeepKeys<D>] ?? [];
			const value = this.getByPath(key as DeepKeys<D>);
			for (const rule of fieldRules) {
				const failMessage = rule({
					val: value,
					listValues: this.data,
					key: key as DeepKeys<D>
				});
				if (failMessage) {
					this.setByPath(this.errors, key as DeepKeys<D>, failMessage);
					this.isValid = false;
					break;
				}
			}
		}

		if (!this.isValid) {
			throw this;
		}
		return this;
	}
}
