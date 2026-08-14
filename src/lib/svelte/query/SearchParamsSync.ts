const INVALID_VALUE = Symbol('invalid-query-search-param');

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (value === null || typeof value !== 'object') return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
};

const parseScalar = (value: string, initial: unknown): unknown | typeof INVALID_VALUE => {
	if (typeof initial === 'string') return value;

	if (typeof initial === 'number') {
		if (!value.trim()) return INVALID_VALUE;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : INVALID_VALUE;
	}

	if (typeof initial === 'boolean') {
		const normalized = value.toLowerCase();
		if (normalized === 'true' || normalized === '1') return true;
		if (normalized === 'false' || normalized === '0') return false;
		return INVALID_VALUE;
	}

	if (typeof initial === 'bigint') {
		if (!value.trim()) return INVALID_VALUE;
		try {
			return BigInt(value);
		} catch {
			return INVALID_VALUE;
		}
	}

	if (initial instanceof Date) {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? INVALID_VALUE : parsed;
	}

	if (initial instanceof URL) {
		try {
			return new URL(value, initial);
		} catch {
			return INVALID_VALUE;
		}
	}

	if (initial instanceof URLSearchParams) return new URLSearchParams(value);

	if (isPlainObject(initial)) {
		try {
			const parsed: unknown = JSON.parse(value);
			return isPlainObject(parsed) ? parsed : INVALID_VALUE;
		} catch {
			return INVALID_VALUE;
		}
	}

	return INVALID_VALUE;
};

const parseValue = (params: URLSearchParams, key: string, initial: unknown): unknown | typeof INVALID_VALUE => {
	if (Array.isArray(initial)) {
		const values = params.getAll(key);
		if (!values.length) return INVALID_VALUE;
		if (!initial.length) return values;

		const parsed = values.map((value) => parseScalar(value, initial[0]));
		return parsed.some((value) => value === INVALID_VALUE) ? INVALID_VALUE : parsed;
	}

	const value = params.get(key);
	return value === null ? INVALID_VALUE : parseScalar(value, initial);
};

const serializeScalar = (value: unknown): string | undefined => {
	if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
	if (value instanceof URL || value instanceof URLSearchParams) return value.toString();

	if (isPlainObject(value)) {
		try {
			return JSON.stringify(value);
		} catch {
			return undefined;
		}
	}

	return undefined;
};

export const fromSearchParams = <T extends Record<string, unknown>>(params: URLSearchParams, initial: Readonly<T>): Partial<T> => {
	const result: Partial<T> = {};

	for (const key of Object.keys(initial) as Array<Extract<keyof T, string>>) {
		if (!params.has(key)) continue;

		const parsed = parseValue(params, key, initial[key]);
		if (parsed !== INVALID_VALUE) Reflect.set(result, key, parsed);
	}

	return result;
};

export const toSearchParams = <T extends Record<string, unknown>>(data: Readonly<T>): URLSearchParams => {
	const params = new URLSearchParams();

	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				const serialized = serializeScalar(item);
				if (serialized !== undefined) params.append(key, serialized);
			}
			continue;
		}

		const serialized = serializeScalar(value);
		if (serialized !== undefined) params.set(key, serialized);
	}

	return params;
};
