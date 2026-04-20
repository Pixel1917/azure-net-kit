import { Cookies, EnvironmentUtil } from '@azure-net/tools';
import { RequestContext } from '@azure-net/edges/context';

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
		if (EnvironmentUtil.isBrowser) {
			Cookies.set(name, value, options);
			return;
		}
		if (EnvironmentUtil.isServer) {
			const event = RequestContext.current().event;
			if (event) {
				const encodedKey = encodeURIComponent(name);

				let serializedValue: string;
				if (typeof value === 'string') {
					serializedValue = encodeURIComponent(value);
				} else {
					serializedValue = encodeURIComponent(JSON.stringify(value));
				}
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
				event.cookies.set(encodedKey, serializedValue, {
					...options,
					path: options?.path ?? '/',
					httpOnly: options?.httpOnly ?? false,
					sameSite: options?.sameSite?.toLowerCase() as 'strict' | 'lax' | 'none',
					expires
				});
				return;
			}
		}
		throw new Error('Could not detect current environment');
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
		if (EnvironmentUtil.isBrowser) {
			return Cookies.get<T>(name) ?? undefined;
		}
		if (EnvironmentUtil.isServer) {
			const event = RequestContext.current().event;
			if (event) {
				const encodedKey = encodeURIComponent(name);
				const cookieValue = event.cookies.get(encodedKey);
				if (cookieValue) {
					const decodedValue = decodeURIComponent(cookieValue);
					try {
						return JSON.parse(decodedValue) as T;
					} catch {
						return decodedValue as T;
					}
				}
				return undefined;
			}
			return undefined;
		}
		return undefined;
	}

	/**
	 * Retrieves all cookies as a key-value record.
	 * Attempts to parse JSON values.
	 *
	 * @template T
	 * @returns {T | undefined} An object with all cookie keys and their values.
	 */
	public static getAll<T = Record<string, unknown>>(): T | undefined {
		if (EnvironmentUtil.isBrowser) {
			return Cookies.getAll() as T;
		}
		if (EnvironmentUtil.isServer) {
			const event = RequestContext.current().event;
			const result: Record<string, unknown> = {};
			if (event) {
				const allCookies = event.cookies.getAll();
				for (const singleCookie of allCookies) {
					try {
						result[singleCookie.name] = JSON.parse(singleCookie.value);
					} catch {
						result[singleCookie.name] = singleCookie.value;
					}
				}
			}
			return result as T;
		}
		return undefined;
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
}
