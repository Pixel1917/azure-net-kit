import { FormDataUtil, ObjectUtil } from 'azure-net-tools';

type DeepKeys<SchemaData> = SchemaData extends object
	? {
			[K in keyof SchemaData & string]: SchemaData[K] extends object ? K | `${K}.${DeepKeys<SchemaData[K]>}` : K;
		}[keyof SchemaData & string]
	: never;

export type ValidationParams<SchemaData = unknown, CurrentValue = unknown, CurrentKey = string> = {
	val: CurrentValue;
	listValues?: Partial<SchemaData>;
	key?: CurrentKey;
};

export type ValidationMessage = string | { key: string; vars?: Record<string, unknown> };

export interface ValidationErrorsMap {
	[key: string]: ValidationMessage | ValidationErrorsMap;
}

export type ValidationResult = ValidationMessage | ValidationErrorsMap | ValidationErrorsMap[] | undefined;

export type ValidationRuleResult<CurrentValue, ListValues = unknown, CurrentKey = string> = (
	params: ValidationParams<CurrentValue, ListValues, CurrentKey>
) => ValidationResult;

type ValidationErrors<Errors> =
	Errors extends ReadonlyArray<infer U>
		? ValidationErrors<U>[]
		: Errors extends object
			? { [K in keyof Errors]?: ValidationErrors<Errors[K]> }
			: ValidationMessage;

export type RequestErrors<SchemaData> = Partial<ValidationErrors<SchemaData>>;

export type RequestRules<SchemaData> = Partial<Record<DeepKeys<SchemaData>, ValidationRuleResult<SchemaData>[]>>;

export class SchemaFail<SchemaData> {
	constructor(private _errors: RequestErrors<SchemaData>) {}

	getErrors() {
		return this._errors;
	}
}

interface SchemaBuilder<SchemaData, Rules = unknown, TransformResult = SchemaData, CustomMethods = unknown> {
	rules(callback: (factory: Rules) => RequestRules<SchemaData>): SchemaBuilder<SchemaData, Rules, TransformResult, CustomMethods>;
	transform<T>(callback: (data: SchemaData) => T): SchemaBuilder<SchemaData, Rules, T, CustomMethods>;
	with<M extends Record<string, unknown>>(callback: () => M): SchemaBuilder<SchemaData, Rules, TransformResult, M>;
	create(): Schema<SchemaData, TransformResult, CustomMethods>;
}

interface SchemaInstance<TransformResult> {
	json(): TransformResult;
	formData(): FormData;
	validated(): boolean;
}

export type Schema<SchemaData, TransformResult, CustomMethods> = CustomMethods & {
	from(data: Partial<SchemaData> | FormData): SchemaInstance<TransformResult>;
	getSchemaError(e: unknown): RequestErrors<SchemaData> | undefined;
};

class SchemaBuilderImpl<SchemaData, Rules = unknown, TransformResult = SchemaData, CustomMethods = unknown>
	implements SchemaBuilder<SchemaData, Rules, TransformResult, CustomMethods>
{
	private _rules?: (factory: Rules) => RequestRules<SchemaData>;
	private _transform?: (data: SchemaData) => unknown;
	private _customMethods?: () => Record<string, unknown>;

	constructor(private _rulesFactory: Rules = {} as Rules) {}

	rules(callback: (factory: Rules) => RequestRules<SchemaData>): SchemaBuilder<SchemaData, Rules, TransformResult, CustomMethods> {
		this._rules = callback;
		return this;
	}

	transform<T>(callback: (data: SchemaData) => T): SchemaBuilder<SchemaData, Rules, T, CustomMethods> {
		this._transform = callback;
		return this as unknown as SchemaBuilder<SchemaData, Rules, T, CustomMethods>;
	}

	with<M extends Record<string, unknown>>(callback: () => M): SchemaBuilder<SchemaData, Rules, TransformResult, M> {
		this._customMethods = callback;
		return this as unknown as SchemaBuilder<SchemaData, Rules, TransformResult, M>;
	}

	create(): Schema<SchemaData, TransformResult, CustomMethods> {
		const rules = this._rules;
		const transform = this._transform || ((data: SchemaData) => data);
		const customMethods = this._customMethods ? this._customMethods() : {};
		const rulesFactory = this._rulesFactory;

		const prepare = (dataToPrepare: Partial<SchemaData> | FormData) => {
			if (dataToPrepare instanceof FormData) {
				return FormDataUtil.toObject<SchemaData>(dataToPrepare);
			}
			return ObjectUtil.deepClone(dataToPrepare);
		};

		const getByPath = <P extends DeepKeys<SchemaData>>(path: P, data: unknown): unknown => {
			return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), data);
		};

		const setByPath = <P extends DeepKeys<SchemaData>>(obj: object, path: P, value: unknown): void => {
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
		};

		const schema = {
			...customMethods,
			getSchemaError(e: unknown) {
				if (e instanceof SchemaFail) {
					return (e as SchemaFail<SchemaData>).getErrors();
				}
				return undefined;
			},
			from(data: Partial<SchemaData> | FormData): SchemaInstance<TransformResult> {
				const _preparedData = prepare(data);
				let _errors: RequestErrors<SchemaData> = {};
				let _isValid = true;

				if (typeof _preparedData !== 'object') {
					throw Error('Data to validate is not an object');
				}

				const validated = (): boolean => {
					if (!rules) return true;

					_isValid = true;
					_errors = {};
					const definedSchema = rules(rulesFactory);

					for (const key in definedSchema) {
						const fieldRules = definedSchema[key as DeepKeys<SchemaData>] ?? [];
						const value = getByPath(key as DeepKeys<SchemaData>, _preparedData);

						for (const rule of fieldRules) {
							const failMessage = rule({
								val: value,
								listValues: _preparedData,
								key: key as DeepKeys<SchemaData>
							});

							if (failMessage) {
								setByPath(_errors, key as DeepKeys<SchemaData>, failMessage);
								_isValid = false;
								break;
							}
						}
					}

					if (!_isValid) {
						throw new SchemaFail<SchemaData>(_errors);
					}
					return true;
				};

				const json = (): TransformResult => {
					validated();
					return transform(_preparedData as SchemaData) as TransformResult;
				};

				const formData = (): FormData => {
					validated();
					return FormDataUtil.fromObject(transform(_preparedData as SchemaData));
				};

				return {
					json,
					formData,
					validated
				};
			}
		};

		return schema as Schema<SchemaData, TransformResult, CustomMethods>;
	}
}

export const createSchemaFactory = <Rules extends Record<string, unknown>>(rules: Rules) => {
	return <SchemaData>(): SchemaBuilder<SchemaData, Rules> => {
		return new SchemaBuilderImpl<SchemaData, Rules>(rules);
	};
};

export const schema = <SchemaData>(): SchemaBuilder<SchemaData> => {
	return new SchemaBuilderImpl<SchemaData>();
};
