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

export const createSchemaFactory = <Rules>(rulesList: Rules) => {
	return <IncomingData, DataAfterTransform = IncomingData>(params: {
		schema: (rules: Rules) => RequestRules<IncomingData>;
		transform: (data: IncomingData) => DataAfterTransform;
	}) => {
		let schemaData: IncomingData;
		let _errors: RequestErrors<IncomingData> = {};
		let _isValid = true;
		const { schema, transform = (data: IncomingData) => data as unknown as DataAfterTransform } = params;
		const definedSchema = schema(rulesList);

		const getByPath = <P extends DeepKeys<IncomingData>>(path: P): unknown => {
			return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), schemaData as unknown);
		};

		const setByPath = <P extends DeepKeys<IncomingData>>(obj: object, path: P, value: unknown): void => {
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

		const prepare = (dataToPrepare: IncomingData) => {
			if (dataToPrepare instanceof FormData) {
				return FormDataUtil.toObject<IncomingData>(dataToPrepare);
			}
			return dataToPrepare;
		};

		const validate = () => {
			_isValid = true;
			_errors = {};
			if (typeof schemaData !== 'object') {
				throw Error('Data to validate is not an object');
			}
			for (const key in definedSchema) {
				const fieldRules = definedSchema[key as DeepKeys<IncomingData>] ?? [];
				const value = getByPath(key as DeepKeys<IncomingData>);
				for (const rule of fieldRules) {
					const failMessage = rule({
						val: value,
						listValues: schemaData,
						key: key as DeepKeys<IncomingData>
					});
					if (failMessage) {
						setByPath(_errors, key as DeepKeys<IncomingData>, failMessage);
						_isValid = false;
						break;
					}
				}
			}

			if (!_isValid) {
				throw this;
			}
			return this;
		};

		const from = (data: IncomingData) => {
			schemaData = prepare(data);
		};

		const formData = () => {
			validate();
			return FormDataUtil.fromObject(transform(schemaData));
		};

		const json = () => {
			validate();
			return transform(schemaData);
		};

		return {
			from,
			json,
			formData,
			validate,
			get errors() {
				return _errors;
			}
		};
	};
};
