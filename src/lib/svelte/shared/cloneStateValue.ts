type TypedArrayView = Exclude<ArrayBufferView, DataView> & { readonly length: number };
type TypedArrayConstructor = new (buffer: ArrayBufferLike, byteOffset: number, length: number) => TypedArrayView;

const preserveExtensibility = (source: object, target: object) => {
	if (!Object.isExtensible(source)) Object.preventExtensions(target);
};

const cloneProperties = (source: object, target: object, seen: WeakMap<object, unknown>, excluded?: PropertyKey) => {
	for (const key of Reflect.ownKeys(source)) {
		if (key === excluded) continue;

		const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
		if (!descriptor) continue;
		if ('value' in descriptor) descriptor.value = cloneValue(descriptor.value, seen);
		Reflect.defineProperty(target, key, descriptor);
	}
};

const cloneValue = (value: unknown, seen: WeakMap<object, unknown>): unknown => {
	if (value === null || typeof value !== 'object') return value;

	const cached = seen.get(value);
	if (cached !== undefined) return cached;

	if (Array.isArray(value)) {
		const result: unknown[] = new Array(value.length);
		seen.set(value, result);
		cloneProperties(value, result, seen, 'length');
		const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
		if (lengthDescriptor) Reflect.defineProperty(result, 'length', lengthDescriptor);
		preserveExtensibility(value, result);
		return result;
	}

	if (value instanceof Date) {
		const result = new Date(value.getTime());
		seen.set(value, result);
		return result;
	}

	if (value instanceof Map) {
		const result = new Map();
		seen.set(value, result);
		for (const [key, entryValue] of value) {
			result.set(cloneValue(key, seen), cloneValue(entryValue, seen));
		}
		return result;
	}

	if (value instanceof Set) {
		const result = new Set();
		seen.set(value, result);
		for (const entryValue of value) result.add(cloneValue(entryValue, seen));
		return result;
	}

	if (value instanceof RegExp) {
		const result = new RegExp(value.source, value.flags);
		result.lastIndex = value.lastIndex;
		seen.set(value, result);
		return result;
	}

	if (typeof URL !== 'undefined' && value instanceof URL) {
		const result = new URL(value.href);
		seen.set(value, result);
		return result;
	}

	if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
		const result = new URLSearchParams(value);
		seen.set(value, result);
		return result;
	}

	if (value instanceof ArrayBuffer) {
		const result = value.slice(0);
		seen.set(value, result);
		return result;
	}

	if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
		const result = value.slice(0);
		seen.set(value, result);
		return result;
	}

	if (ArrayBuffer.isView(value)) {
		const buffer = cloneValue(value.buffer, seen) as ArrayBufferLike;
		const result =
			value instanceof DataView
				? new DataView(buffer, value.byteOffset, value.byteLength)
				: new (value.constructor as TypedArrayConstructor)(buffer, value.byteOffset, (value as TypedArrayView).length);
		seen.set(value, result);
		return result;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		// File, Blob, Promise and class instances cannot be cloned generically without
		// losing internal slots or behavior. Keeping them is lossless and preserves DX.
		return value;
	}

	const result = Object.create(prototype) as object;
	seen.set(value, result);
	cloneProperties(value, result, seen);
	preserveExtensibility(value, result);
	return result;
};

/** Creates a detached graph from plain state while preserving opaque values. */
export const cloneStateValue = <T>(value: T): T => cloneValue(value, new WeakMap()) as T;
