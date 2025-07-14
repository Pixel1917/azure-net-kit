export type ArrayFormat = 'repeat' | 'brackets' | 'comma' | 'json';
export type ObjectFormat = 'default' | 'nested-brackets';

export interface IQueryBuilder {
	build(
		params: Record<string, unknown>,
		opts?: {
			arrayFormat?: ArrayFormat;
			objectFormat?: ObjectFormat;
		}
	): string;
}

export class QueryBuilder implements IQueryBuilder {
	private readonly defaultArrayFormat: ArrayFormat;
	private readonly defaultObjectFormat: ObjectFormat;

	constructor(options?: { arrayFormat?: ArrayFormat; objectFormat?: ObjectFormat }) {
		this.defaultArrayFormat = options?.arrayFormat ?? 'repeat';
		this.defaultObjectFormat = options?.objectFormat ?? 'default';
	}

	build(
		params: Record<string, unknown>,
		opts?: {
			delimiter?: boolean;
			arrayFormat?: ArrayFormat;
			objectFormat?: ObjectFormat;
		}
	): string {
		const arrayFormat = opts?.arrayFormat ?? this.defaultArrayFormat;
		const objectFormat = opts?.objectFormat ?? this.defaultObjectFormat;

		const parts = this.serialize(params, arrayFormat, objectFormat);
		const delimiter = opts?.delimiter ?? true;
		return delimiter && parts.length ? `?${parts.join('&')}` : parts.join('&');
	}

	private serialize(obj: Record<string, unknown>, arrayFormat: ArrayFormat, objectFormat: ObjectFormat, prefix = ''): string[] {
		const parts: string[] = [];

		for (const [key, value] of Object.entries(obj)) {
			if (value === null || value === undefined) continue;

			const fullKey = prefix ? (objectFormat === 'nested-brackets' ? `${prefix}[${key}]` : `${prefix}.${key}`) : key;

			if (Array.isArray(value)) {
				parts.push(...this.encodeArray(fullKey, value, arrayFormat));
			} else if (typeof value === 'object' && !(value instanceof Date)) {
				if (objectFormat === 'nested-brackets') {
					parts.push(...this.serialize(value as Record<string, unknown>, arrayFormat, objectFormat, fullKey));
				} else {
					parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(JSON.stringify(value))}`);
				}
			} else {
				parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
			}
		}

		return parts;
	}

	private encodeArray(key: string, arr: unknown[], arrayFormat: ArrayFormat): string[] {
		const cleanArray = arr.filter((v) => v !== null && v !== undefined).map(String);

		switch (arrayFormat) {
			case 'repeat':
				return cleanArray.map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
			case 'brackets':
				return cleanArray.map((v) => `${encodeURIComponent(key)}[]=${encodeURIComponent(v)}`);
			case 'comma':
				return [`${encodeURIComponent(key)}=${encodeURIComponent(cleanArray.join(','))}`];
			case 'json':
				return [`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(cleanArray))}`];
			default:
				throw new Error(`Unsupported array format: ${arrayFormat}`);
		}
	}
}
