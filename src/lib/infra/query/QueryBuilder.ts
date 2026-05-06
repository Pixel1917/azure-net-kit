import { AzureNetKitInternalError } from '../../shared/app-error/AppError.js';

export type ArrayFormat = 'repeat' | 'brackets' | 'comma' | 'json';
export type ObjectFormat = 'default' | 'nested-brackets';

export interface IQueryBuilderSettings<TTransformInput extends object = object> {
	delimiter?: boolean;
	arrayFormat?: ArrayFormat;
	objectFormat?: ObjectFormat;
	transform?: (obj: TTransformInput) => object;
}

export interface IQueryBuilderInstance<TTransformInput extends object = object> {
	toString: (query: object, settings?: IQueryBuilderSettings<TTransformInput>) => string;
	toSearchParams: (query: object, settings?: Omit<IQueryBuilderSettings<TTransformInput>, 'delimiter'>) => URLSearchParams;
}

type QuerySettingsResolved<TTransformInput extends object = object> = Required<
	Pick<IQueryBuilderSettings<TTransformInput>, 'delimiter' | 'arrayFormat' | 'objectFormat'>
> &
	Pick<IQueryBuilderSettings<TTransformInput>, 'transform'>;

const normalizeSettings = <TTransformInput extends object = object>(
	base?: IQueryBuilderSettings<TTransformInput>,
	override?: IQueryBuilderSettings<TTransformInput>
): QuerySettingsResolved<TTransformInput> => {
	return {
		delimiter: override?.delimiter ?? base?.delimiter ?? true,
		arrayFormat: override?.arrayFormat ?? base?.arrayFormat ?? 'repeat',
		objectFormat: override?.objectFormat ?? base?.objectFormat ?? 'default',
		transform: override?.transform ?? base?.transform
	};
};

const encodeQuery = (entries: Array<[string, string]>) =>
	entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');

const encodeArrayEntries = (key: string, values: unknown[], arrayFormat: ArrayFormat): Array<[string, string]> => {
	const cleanValues = values.filter((v) => v !== null && v !== undefined).map((v) => String(v));
	switch (arrayFormat) {
		case 'repeat':
			return cleanValues.map((v) => [key, v]);
		case 'brackets':
			return cleanValues.map((v) => [`${key}[]`, v]);
		case 'comma':
			return [[key, cleanValues.join(',')]];
		case 'json':
			return [[key, JSON.stringify(cleanValues)]];
		default:
			throw new AzureNetKitInternalError(`[QueryInstance] Unsupported array format: ${arrayFormat}`);
	}
};

const serializeEntries = (obj: object, arrayFormat: ArrayFormat, objectFormat: ObjectFormat, prefix = ''): Array<[string, string]> => {
	const entries: Array<[string, string]> = [];
	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) continue;

		const fullKey = prefix ? (objectFormat === 'nested-brackets' ? `${prefix}[${key}]` : `${prefix}.${key}`) : key;
		if (Array.isArray(value)) {
			entries.push(...encodeArrayEntries(fullKey, value, arrayFormat));
			continue;
		}

		if (typeof value === 'object' && !(value instanceof Date)) {
			if (objectFormat === 'nested-brackets') {
				entries.push(...serializeEntries(value as object, arrayFormat, objectFormat, fullKey));
			} else {
				entries.push([fullKey, JSON.stringify(value)]);
			}
			continue;
		}

		entries.push([fullKey, String(value)]);
	}
	return entries;
};

const toSearchParamsWithSettings = <TTransformInput extends object = object>(
	query: object,
	settings: QuerySettingsResolved<TTransformInput>
): URLSearchParams => {
	const source = settings.transform ? settings.transform(query as TTransformInput) : query;
	const entries = serializeEntries(source, settings.arrayFormat, settings.objectFormat);
	const params = new URLSearchParams();
	for (const [key, value] of entries) {
		params.append(key, value);
	}
	return params;
};

export const createQueryInstance = <TTransformInput extends object = object>(
	defaults?: IQueryBuilderSettings<TTransformInput>
): IQueryBuilderInstance<TTransformInput> => {
	return {
		toSearchParams: (query: object, settings?: Omit<IQueryBuilderSettings<TTransformInput>, 'delimiter'>) => {
			const resolved = normalizeSettings<TTransformInput>(defaults, settings);
			return toSearchParamsWithSettings(query, resolved);
		},
		toString: (query: object, settings?: IQueryBuilderSettings<TTransformInput>) => {
			const resolved = normalizeSettings<TTransformInput>(defaults, settings);
			const serialized = encodeQuery(Array.from(toSearchParamsWithSettings(query, resolved).entries()));
			return resolved.delimiter && serialized ? `?${serialized}` : serialized;
		}
	};
};
