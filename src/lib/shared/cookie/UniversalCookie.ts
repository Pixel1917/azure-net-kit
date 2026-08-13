import { BROWSER, Cookies } from '../../external/tools/index.js';
import { RequestContext } from '../../external/edges/ServerContext.js';

export type CookieOptions = {
	expires?: Date | number;
	maxAge?: number;
	path?: string;
	domain?: string;
	secure?: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
	httpOnly?: boolean;
	priority?: 'low' | 'medium' | 'high' | undefined;
	partitioned?: boolean | undefined;
};

/**
 * Utility class for managing cookies in svelte ssr (browser and server).
 * Supports setting, getting, deleting, checking, and clearing cookies.
 * All methods are static and operate without creating instances.
 */
export class UniversalCookie {
	private static serialize<T>(value: T): string {
		if (typeof value === 'string') return value;

		const serialized = JSON.stringify(value);
		if (serialized === undefined) throw new TypeError('Cookie value is not JSON-serializable.');
		return serialized;
	}

	private static deserialize<T>(value: string, decodeLegacy = false): T {
		try {
			return JSON.parse(value) as T;
		} catch {
			if (!decodeLegacy) return value as T;
		}

		let decodedValue: string;
		try {
			decodedValue = decodeURIComponent(value);
		} catch {
			return value as T;
		}

		try {
			return JSON.parse(decodedValue) as T;
		} catch {
			return decodedValue as T;
		}
	}

	/**
	 * Sets a cookie with the specified key, value, and options.
	 * Serializes non-string values as JSON.
	 *
	 * @template T
	 * @param {string} name - The cookie key (alphanumeric, dash, underscore only).
	 * @param {T} value - The value to store in the cookie.
	 * @param {CookieOptions} [options] - Optional cookie attributes.
	 * @returns {void}
	 */
	public static set<T>(name: string, value: T, options?: CookieOptions): void {
		const serializedValue = this.serialize(value);

		if (BROWSER) {
			Cookies.set(name, serializedValue, options);
			return;
		} else {
			const event = RequestContext.current().event;
			if (event) {
				let expires: Date | undefined;
				if (options?.expires !== undefined) {
					if (typeof options.expires === 'number') {
						const date = new Date();
						date.setTime(date.getTime() + options.expires * 86400 * 1000);
						expires = date;
					} else {
						expires = options.expires;
					}
				}
				event.cookies.set(name, serializedValue, {
					...options,
					path: options?.path ?? '/',
					httpOnly: options?.httpOnly ?? false,
					sameSite: options?.sameSite?.toLowerCase() as 'strict' | 'lax' | 'none',
					expires
				});
				return;
			}
		}
	}

	/**
	 * Retrieves the value of a cookie by key.
	 * Attempts to parse JSON if possible.
	 *
	 * @template T
	 * @param {string} name - The cookie key to retrieve.
	 * @returns {T | undefined} The cookie value, parsed as type T or null if not found.
	 */
	public static get<T = string>(name: string): T | undefined {
		if (BROWSER) {
			const value = Cookies.get<string>(name, { parse: false });
			return value === null ? undefined : this.deserialize<T>(value);
		} else {
			const event = RequestContext.current().event;
			if (event) {
				const cookieValue = event.cookies.get(name) ?? event.cookies.get(encodeURIComponent(name));
				if (cookieValue !== undefined) return this.deserialize<T>(cookieValue, true);
				return undefined;
			}
			return undefined;
		}
	}

	/**
	 * Retrieves all cookies as a key-value record.
	 * Attempts to parse JSON values.
	 *
	 * @template T
	 * @returns {T | undefined} An object with all cookie keys and their values.
	 */
	public static getAll<T = Record<string, unknown>>(): T | undefined {
		if (BROWSER) {
			const allCookies = Cookies.getAll({ parse: false });
			return Object.fromEntries(Object.entries(allCookies).map(([name, value]) => [name, this.deserialize(String(value))])) as T;
		} else {
			const event = RequestContext.current().event;
			const result: Record<string, unknown> = {};
			if (event) {
				const allCookies = event.cookies.getAll();
				for (const singleCookie of allCookies) {
					result[singleCookie.name] = this.deserialize(singleCookie.value, true);
				}
			}
			return result as T;
		}
	}

	/**
	 * Checks if a cookie with the given key exists.
	 *
	 * @param {string} name - The cookie key to check.
	 * @returns {boolean} True if cookie exists, false otherwise.
	 */
	public static has(name: string): boolean {
		return this.get(name) !== undefined;
	}

	/**
	 * Deletes a cookie by key.
	 *
	 * @param {string} name - The cookie key to delete.
	 * @param {CookieOptions} [options] - Optional cookie attributes.
	 * @returns {void}
	 */
	public static delete(name: string, options?: CookieOptions): void {
		this.set(name, '', {
			...options,
			expires: new Date(0),
			maxAge: 0
		});
	}

	/**
	 * Deletes all cookies with default domain and path.
	 * It's recommended to specify path and domain in options for full cleanup.
	 *
	 * @param {CookieOptions} [options] - Optional cookie attributes.
	 * @returns {void}
	 */
	public static clear(options?: CookieOptions): void {
		const allCookies = this.getAll();
		if (allCookies) {
			for (const key in allCookies) {
				this.delete(key, options);
			}
		}
	}

	public static toCredentials() {
		const all = this.getAll<Record<string, unknown>>() ?? {};
		return Object.entries(all)
			.map(([key, value]) => {
				const serialized = typeof value === 'string' ? value : JSON.stringify(value);
				return `${encodeURIComponent(key)}=${encodeURIComponent(serialized)}`;
			})
			.join('; ');
	}
}
