export interface TranslationSnapshot {
	locale: string;
}
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace App {
		interface RequestContextState {
			currLocale?: string;
			i18n?: Record<string, TranslationSnapshot>;
		}
	}
}

export type Translation = string | { [key: string]: Translation };

export type TranslationShape<T> = T extends string ? string : T extends Record<string, unknown> ? { [K in keyof T]: TranslationShape<T[K]> } : never;

export type Path<T, Prefix extends string = '', Depth extends unknown[] = []> = T extends string
	? never
	: T extends Record<string, unknown>
		? {
				[K in keyof T & string]: T[K] extends string
					? `${Prefix}${K}`
					: Depth['length'] extends 12
						? `${Prefix}${K}.${string}`
						: Path<T[K], `${Prefix}${K}.`, [...Depth, unknown]>;
			}[keyof T & string]
		: never;

export interface TranslationCookieOptions {
	expires?: Date | number;
	maxAge?: number;
	path?: string;
	domain?: string;
	secure?: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
}

export type MessageLoader = () => Promise<Translation>;
export type TranslationVariables = Record<string, unknown>;
