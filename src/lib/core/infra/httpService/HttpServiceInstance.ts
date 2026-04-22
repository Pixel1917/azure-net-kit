import { BROWSER } from '@azure-net/tools/environment';
import { RequestContext } from '@azure-net/edges/context';

export type SearchParamsInit = string | string[][] | Record<string, string> | URLSearchParams | undefined;
export type SearchParamsOption = SearchParamsInit | Record<string, string | number | boolean | undefined> | Array<Array<string | number | boolean>>;

export enum HttpInstanceFetchMethods {
	GET = 'GET',
	POST = 'POST',
	PUT = 'PUT',
	PATCH = 'PATCH',
	DELETE = 'DELETE',
	HEAD = 'HEAD',
	OPTIONS = 'OPTIONS'
}

export interface IHttpServiceResponse<T = unknown> {
	headers: Record<string, string>;
	status: number;
	success: boolean;
	data: T;
	message: string;
	raw?: Response;
}

export interface IHttpServiceError<T = unknown> {
	type: HttpErrorTypes;
	response?: Response;
	original?: Error;
	message: string;
	status: number;
	data?: T;
}

export class HttpServiceResponse<T> implements IHttpServiceResponse<T> {
	headers: Record<string, string>;
	status: number;
	success: boolean;
	data: T;
	message: string;
	raw?: Response;

	constructor({ headers, status, success, data, message, raw }: IHttpServiceResponse<T>) {
		this.headers = headers;
		this.status = status;
		this.success = success;
		this.data = data;
		this.message = message;
		this.raw = raw;
	}
}

export enum HttpErrorTypes {
	Internal = 'internal',
	External = 'external'
}

export class HttpServiceError<T> extends Error implements IHttpServiceError<T> {
	data?: T;
	status: number;
	message: string;
	type: HttpErrorTypes;
	original?: Error;
	response?: Response;

	constructor({ status = 500, data, message = 'unknown error', original, type = HttpErrorTypes.Internal, response }: Partial<IHttpServiceError<T>>) {
		super(message);
		this.status = status;
		this.data = data;
		this.message = message;
		this.original = original;
		this.response = response;
		this.type = type;
	}
}

export interface HttpInstanceNormalizedRequest {
	url: string | URL;
	method: HttpInstanceFetchMethods;
	headers: Headers;
	body: BodyInit | null | undefined;
	responseFormat: 'json' | 'blob' | 'text' | 'arrayBuffer' | 'body';
	includeRaw: boolean;
	timeout: number | false;
	retry: number;
	stringifyJson: (data: unknown) => string | undefined;
	fetch: typeof fetch;
	requestInit: Omit<RequestInit, 'method' | 'headers' | 'body'>;
}

export type HttpInstanceOnRequest = (request: HttpInstanceNormalizedRequest) => void | Promise<void>;
export type HttpInstanceOnError = (error: HttpServiceError<unknown>, request: HttpInstanceNormalizedRequest) => void | Promise<void>;

export type HttpInstanceDoFetch = <T = unknown>(request: HttpInstanceNormalizedRequest) => Promise<IHttpServiceResponse<T>>;

export interface IHttpInstanceOptions extends Omit<RequestInit, 'headers' | 'method'> {
	headers?: NonNullable<RequestInit['headers']> | Record<string, string | undefined>;
	json?: unknown;
	stringifyJson?: (data: unknown) => string | undefined;
	searchParams?: SearchParamsOption;
	prefixUrl?: URL | string;
	timeout?: number | false;
	retry?: number;
	includeRaw?: boolean;
	responseFormat?: 'json' | 'blob' | 'text' | 'arrayBuffer' | 'body';
	onRequest?: HttpInstanceOnRequest;
	onError?: HttpInstanceOnError;
	doFetch?: HttpInstanceDoFetch;
}

export type HttpInstanceRequestMethod = <T = unknown>(url: string | URL, options?: IHttpInstanceOptions) => Promise<IHttpServiceResponse<T>>;

export interface IHttpServiceInstance {
	get: HttpInstanceRequestMethod;
	post: HttpInstanceRequestMethod;
	put: HttpInstanceRequestMethod;
	delete: HttpInstanceRequestMethod;
	patch: HttpInstanceRequestMethod;
	head: HttpInstanceRequestMethod;
	options: HttpInstanceRequestMethod;
}

const stringifyJsonFunc = (data: unknown) => {
	try {
		return JSON.stringify(data);
	} catch {
		return undefined;
	}
};

const isAbsoluteUrl = (value: string): boolean => /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);

const normalizeHeaders = (headers?: IHttpInstanceOptions['headers']): Headers => {
	if (!headers) return new Headers();
	if (headers instanceof Headers) return new Headers(headers);
	if (Array.isArray(headers)) return new Headers(headers);
	return new Headers(Object.entries(headers).filter(([, value]) => value !== undefined) as Array<[string, string]>);
};

const normalizeSearchParams = (value?: SearchParamsOption): URLSearchParams => {
	if (!value) return new URLSearchParams();
	if (value instanceof URLSearchParams) return new URLSearchParams(value);
	if (typeof value === 'string') return new URLSearchParams(value);
	if (Array.isArray(value)) {
		const params = new URLSearchParams();
		for (const [key, rawValue] of value) {
			params.append(String(key), String(rawValue));
		}
		return params;
	}

	const params = new URLSearchParams();
	for (const [key, rawValue] of Object.entries(value)) {
		if (rawValue === undefined) continue;
		params.append(key, String(rawValue));
	}
	return params;
};

const mergeSearchParams = (base?: SearchParamsOption, extra?: SearchParamsOption): URLSearchParams | undefined => {
	if (!base && !extra) return undefined;
	const result = normalizeSearchParams(base);
	const next = normalizeSearchParams(extra);
	for (const [key, value] of next.entries()) {
		result.append(key, value);
	}
	return result;
};

const mergeOptions = (base: IHttpInstanceOptions = {}, extra: IHttpInstanceOptions = {}): IHttpInstanceOptions => {
	const mergedHeaders = new Headers(normalizeHeaders(base.headers));
	for (const [key, value] of normalizeHeaders(extra.headers).entries()) {
		mergedHeaders.set(key, value);
	}

	const mergedSearchParams = mergeSearchParams(base.searchParams, extra.searchParams);

	return {
		...base,
		...extra,
		headers: mergedHeaders,
		searchParams: mergedSearchParams,
		stringifyJson: extra.stringifyJson ?? base.stringifyJson,
		onRequest: extra.onRequest ?? base.onRequest,
		onError: extra.onError ?? base.onError,
		doFetch: extra.doFetch ?? base.doFetch
	};
};

const mergeQueryToRelativeUrl = (url: string, searchParams: URLSearchParams): string => {
	const hashIndex = url.indexOf('#');
	const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
	const urlWithoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

	const queryIndex = urlWithoutHash.indexOf('?');
	const path = queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash;
	const query = queryIndex >= 0 ? urlWithoutHash.slice(queryIndex + 1) : '';

	const merged = new URLSearchParams(query);
	for (const [key, value] of searchParams.entries()) {
		merged.append(key, value);
	}

	const nextQuery = merged.toString();
	return `${path}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
};

const resolveUrl = (target: string | URL, baseUrl?: string | URL, searchParams?: SearchParamsOption): string | URL => {
	if (!baseUrl && !searchParams) return target;

	let rawUrl = String(target);
	if (baseUrl) {
		const base = String(baseUrl);
		rawUrl = isAbsoluteUrl(rawUrl) ? rawUrl : new URL(rawUrl, base).toString();
	}

	if (!searchParams) return rawUrl;

	const normalizedSearchParams = normalizeSearchParams(searchParams);
	if (!normalizedSearchParams.size) return rawUrl;

	if (isAbsoluteUrl(rawUrl)) {
		const absoluteUrl = new URL(rawUrl);
		for (const [key, value] of normalizedSearchParams.entries()) {
			absoluteUrl.searchParams.append(key, value);
		}
		return absoluteUrl.toString();
	}

	return mergeQueryToRelativeUrl(rawUrl, normalizedSearchParams);
};

const parseBodyByFormat = async <T>(response: Response, format: HttpInstanceNormalizedRequest['responseFormat']): Promise<T> => {
	switch (format) {
		case 'blob':
			return (await response.blob()) as T;
		case 'text':
			return (await response.text()) as T;
		case 'arrayBuffer':
			return (await response.arrayBuffer()) as T;
		case 'body':
			return response.body as T;
		case 'json':
			return (await response.json()) as T;
		default:
			return (await response.json()) as T;
	}
};

const withTimeout = (signal: AbortSignal | null | undefined, timeout: number | false | undefined) => {
	if (!timeout || timeout <= 0) {
		return { signal, clear: () => undefined };
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error('Request timeout exceeded')), timeout);

	const abortBySource = () => controller.abort(signal?.reason);
	if (signal) {
		if (signal.aborted) {
			abortBySource();
		} else {
			signal.addEventListener('abort', abortBySource, { once: true });
		}
	}

	return {
		signal: controller.signal,
		clear: () => {
			clearTimeout(timer);
			if (signal) signal.removeEventListener('abort', abortBySource);
		}
	};
};

const shouldRetryError = (error: unknown): boolean => {
	return error instanceof HttpServiceError && error.type === HttpErrorTypes.External;
};

const normalizeUnknownError = (error: unknown): Error => {
	if (error instanceof Error) return error;
	return new Error(String(error));
};

const parseResponse = async <T>(response: Response, request: HttpInstanceNormalizedRequest) => {
	const raw = request.includeRaw && typeof response?.clone === 'function' ? response?.clone() : undefined;
	let data: T;
	let parseError: Error | undefined;
	try {
		data = await parseBodyByFormat<T>(response, request.responseFormat);
	} catch (error) {
		parseError = normalizeUnknownError(error);
		data = undefined as T;
	}
	if (!response.ok || parseError) {
		const message = !response.ok
			? `Request failed with status code ${response.status}. ${response.statusText}`
			: (parseError?.message ?? 'Internal error');
		throw new HttpServiceError({
			status: response.status,
			data,
			message,
			type: !response.ok ? HttpErrorTypes.External : HttpErrorTypes.Internal,
			original: parseError,
			response: raw ?? response
		});
	}
	return { data, headers: Object.fromEntries(response.headers.entries()), status: response.status, raw };
};

const defaultDoFetch: HttpInstanceDoFetch = async <T = unknown>(request: HttpInstanceNormalizedRequest): Promise<IHttpServiceResponse<T>> => {
	const maxAttempts = Math.max(1, Math.floor(request.retry) + 1);
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const timeoutState = withTimeout(request.requestInit.signal ?? null, request.timeout);
		try {
			const response = await request.fetch(request.url, {
				...request.requestInit,
				method: request.method,
				headers: request.headers,
				body: request.body,
				signal: timeoutState.signal ?? undefined
			});

			const { data, headers, status, raw } = await parseResponse<T>(response, request);

			return new HttpServiceResponse<T>({
				headers,
				status,
				success: true,
				data,
				message: 'Request completed',
				raw
			});
		} catch (error) {
			lastError = error;
			if (attempt >= maxAttempts || !shouldRetryError(error)) {
				throw error;
			}
		} finally {
			timeoutState.clear();
		}
	}

	throw lastError;
};

const makeMethod = (method: HttpInstanceFetchMethods, defaults: IHttpInstanceOptions): HttpInstanceRequestMethod => {
	return async <T = unknown>(url: string | URL, options: IHttpInstanceOptions = {}) => {
		const merged = mergeOptions(defaults, options);
		const stringifyJson = merged.stringifyJson ?? stringifyJsonFunc;
		const fetcher = !BROWSER ? (RequestContext.current()?.event?.fetch ?? fetch) : fetch;

		const headers = normalizeHeaders(merged.headers);
		let body = merged.body;
		if (merged.json !== undefined && body === undefined) {
			body = stringifyJson(merged.json);
			if (!headers.has('content-type')) {
				headers.set('content-type', 'application/json');
			}
		}

		const responseFormat = merged.responseFormat ?? 'json';
		if (responseFormat === 'json' && !headers.has('accept')) {
			headers.set('accept', 'application/json');
		}

		const normalizedRequest: HttpInstanceNormalizedRequest = {
			url: resolveUrl(url, merged.prefixUrl, merged.searchParams),
			method,
			headers,
			body,
			responseFormat,
			includeRaw: merged.includeRaw ?? false,
			timeout: merged.timeout ?? 20000,
			retry: merged.retry ?? 0,
			stringifyJson,
			fetch: fetcher,
			requestInit: {
				cache: merged.cache,
				credentials: merged.credentials,
				integrity: merged.integrity,
				keepalive: merged.keepalive,
				mode: merged.mode,
				priority: merged.priority,
				redirect: merged.redirect,
				referrer: merged.referrer,
				referrerPolicy: merged.referrerPolicy,
				signal: merged.signal,
				window: merged.window
			}
		};

		const onRequest = options.onRequest ?? defaults.onRequest;
		if (onRequest) {
			await onRequest(normalizedRequest);
		}

		const doFetch = merged.doFetch ?? defaults.doFetch ?? defaultDoFetch;
		try {
			return await doFetch<T>(normalizedRequest);
		} catch (error) {
			const normalizedError =
				error instanceof HttpServiceError
					? error
					: new HttpServiceError({
							data: undefined,
							message: normalizeUnknownError(error).message ?? 'Unknown error',
							original: normalizeUnknownError(error)
						});

			const onError = options.onError ?? defaults.onError;
			if (!onError) throw normalizedError;
			await onError(normalizedError, normalizedRequest);
			throw normalizedError;
		}
	};
};

export const createHttpServiceInstance = (config: IHttpInstanceOptions = {}): IHttpServiceInstance => {
	const defaults: IHttpInstanceOptions = { ...config };

	return {
		get: makeMethod(HttpInstanceFetchMethods.GET, defaults),
		post: makeMethod(HttpInstanceFetchMethods.POST, defaults),
		put: makeMethod(HttpInstanceFetchMethods.PUT, defaults),
		delete: makeMethod(HttpInstanceFetchMethods.DELETE, defaults),
		patch: makeMethod(HttpInstanceFetchMethods.PATCH, defaults),
		head: makeMethod(HttpInstanceFetchMethods.HEAD, defaults),
		options: makeMethod(HttpInstanceFetchMethods.OPTIONS, defaults)
	};
};
