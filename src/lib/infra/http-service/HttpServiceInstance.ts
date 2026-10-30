import { BROWSER } from '../../external/tools/index.js';
import { RequestContext } from '../../shared/request-context/Internal.js';

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

export interface IHttpInstanceNormalizedRequest {
	url: string | URL;
	method: HttpInstanceFetchMethods;
	headers: Headers;
	body: BodyInit | null | undefined;
	responseFormat: 'json' | 'blob' | 'text' | 'arrayBuffer' | 'body';
	includeRaw: boolean;
	timeout: number | false;
	retry?: IHttpInstanceRetryOptions;
	stringifyJson: (data: unknown) => string | undefined;
	fetch: typeof fetch;
	requestInit: Omit<RequestInit, 'method' | 'headers' | 'body'>;
}

export type IHttpInstanceOnRequest = (request: IHttpInstanceNormalizedRequest) => void | Promise<void>;
export type IHttpInstanceOnError = (error: HttpServiceError<unknown>, request: IHttpInstanceNormalizedRequest) => void | Promise<void>;

export type IHttpInstanceDoFetch = <T = unknown>(request: IHttpInstanceNormalizedRequest) => Promise<IHttpServiceResponse<T>>;

export interface IHttpInstanceRetryOptions {
	/** Number of additional attempts. Zero disables retries, including inherited policies. */
	limit: number;
	statuses?: readonly number[];
	shouldRetry?: (context: { error: HttpServiceError<unknown> }) => boolean | Promise<boolean>;
}

export interface IHttpInstanceOptions<T = unknown> extends Omit<RequestInit, 'headers' | 'method'> {
	headers?: NonNullable<RequestInit['headers']> | Record<string, string | undefined>;
	json?: unknown;
	stringifyJson?: (data: unknown) => string | undefined;
	searchParams?: SearchParamsOption;
	prefixUrl?: URL | string;
	timeout?: number | false;
	retry?: IHttpInstanceRetryOptions;
	includeRaw?: boolean;
	responseFormat?: 'json' | 'blob' | 'text' | 'arrayBuffer' | 'body';
	onRequest?: IHttpInstanceOnRequest;
	onError?: IHttpInstanceOnError;
	onResponse?: (response: IHttpServiceResponse<T>) => void | Promise<void>;
	doFetch?: IHttpInstanceDoFetch;
}

export type IHttpInstanceRequestMethod = <T = unknown>(url: string | URL, options?: IHttpInstanceOptions<T>) => Promise<IHttpServiceResponse<T>>;

export interface IHttpServiceInstance {
	get: IHttpInstanceRequestMethod;
	post: IHttpInstanceRequestMethod;
	put: IHttpInstanceRequestMethod;
	delete: IHttpInstanceRequestMethod;
	patch: IHttpInstanceRequestMethod;
	head: IHttpInstanceRequestMethod;
	options: IHttpInstanceRequestMethod;
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

const mergeOptions = <T = unknown>(base: IHttpInstanceOptions = {}, extra: IHttpInstanceOptions<T> = {}): IHttpInstanceOptions<T> => {
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
		onResponse: extra.onResponse ?? base.onResponse,
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

const parseBodyByFormat = async <T>(response: Response, format: IHttpInstanceNormalizedRequest['responseFormat']): Promise<T> => {
	switch (format) {
		case 'blob':
			return (await response.blob()) as T;
		case 'text':
			return (await response.text()) as T;
		case 'arrayBuffer':
			return (await response.arrayBuffer()) as T;
		case 'body':
			return response.body as T;
		case 'json': {
			const text = await response.text();
			return (text.trim() ? JSON.parse(text) : undefined) as T;
		}
		default: {
			const text = await response.text();
			return (text.trim() ? JSON.parse(text) : undefined) as T;
		}
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

const normalizeUnknownError = (error: unknown): Error => {
	if (error instanceof Error) return error;
	return new Error(String(error));
};

const parseResponse = async <T>(response: Response, request: IHttpInstanceNormalizedRequest) => {
	const raw = request.includeRaw && typeof response?.clone === 'function' ? response?.clone() : undefined;
	const hasNoBody = request.method === HttpInstanceFetchMethods.HEAD || response.status === 204 || response.status === 205;
	let data = undefined as T;
	let parseError: Error | undefined;
	if (!hasNoBody) {
		try {
			data = await parseBodyByFormat<T>(response, request.responseFormat);
		} catch (error) {
			parseError = normalizeUnknownError(error);
		}
	}
	if (!response.ok || parseError) {
		const message = !response.ok
			? `Request failed with status code ${response.status}. ${response.statusText}`
			: (parseError?.message ?? `Internal error. Request failed. ${response?.status ?? ''} ${response?.statusText ?? ''}`);
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

const defaultDoFetch: IHttpInstanceDoFetch = async <T = unknown>(request: IHttpInstanceNormalizedRequest): Promise<IHttpServiceResponse<T>> => {
	const timeoutState = withTimeout(request.requestInit.signal, request.timeout);
	try {
		const response = await request.fetch(request.url, {
			...request.requestInit,
			method: request.method,
			headers: request.headers,
			body: request.body,
			signal: timeoutState.signal ?? undefined
		});
		const { data, headers, status, raw } = await parseResponse<T>(response, request);
		return new HttpServiceResponse<T>({ headers, status, success: true, data, message: 'Request completed', raw });
	} finally {
		timeoutState.clear();
	}
};

const makeMethod = (method: HttpInstanceFetchMethods, defaults: IHttpInstanceOptions): IHttpInstanceRequestMethod => {
	return async <T = unknown>(url: string | URL, options: IHttpInstanceOptions<T> = {}): Promise<IHttpServiceResponse<T>> => {
		const merged = mergeOptions<T>(defaults, options);
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

		const normalizedRequest: IHttpInstanceNormalizedRequest = {
			url: resolveUrl(url, merged.prefixUrl, merged.searchParams),
			method,
			headers,
			body,
			responseFormat,
			includeRaw: merged.includeRaw ?? false,
			timeout: merged.timeout ?? 20000,
			retry: merged.retry,
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

		// Snapshot the policy per call: hooks and concurrent requests cannot extend its budget.
		const policy = merged.retry;
		const limit = policy?.limit ?? 0;
		if (!Number.isSafeInteger(limit) || limit < 0) {
			throw new RangeError('retry.limit must be a non-negative safe integer');
		}
		const statuses = policy?.statuses ? [...policy.statuses] : undefined;
		const shouldRetry = policy?.shouldRetry;
		const doFetch = merged.doFetch ?? defaultDoFetch;
		let fetched: IHttpServiceResponse<T>;
		for (let attempt = 0; ; attempt++) {
			normalizedRequest.requestInit.signal?.throwIfAborted();
			// Re-run authentication/header hooks after recovery, without accumulating headers.
			normalizedRequest.headers = new Headers(headers);
			await merged.onRequest?.(normalizedRequest);
			normalizedRequest.requestInit.signal?.throwIfAborted();
			try {
				fetched = await doFetch<T>(normalizedRequest);
				break;
			} catch (error) {
				const normalizedError =
					error instanceof HttpServiceError
						? error
						: new HttpServiceError({
								message: normalizeUnknownError(error).message,
								original: normalizeUnknownError(error)
							});
				const aborted = normalizedRequest.requestInit.signal?.aborted || normalizedError.original?.name === 'AbortError';
				const streaming = typeof ReadableStream !== 'undefined' && normalizedRequest.body instanceof ReadableStream;
				const eligible = !aborted && !streaming && attempt < limit && (!statuses || statuses.includes(normalizedError.status));
				if (eligible && (!shouldRetry || (await shouldRetry({ error: normalizedError })))) {
					normalizedRequest.requestInit.signal?.throwIfAborted();
					continue;
				}
				await merged.onError?.(normalizedError, normalizedRequest);
				throw normalizedError;
			}
		}
		// Consumer callback failures must never replay a successful HTTP operation.
		await merged.onResponse?.(fetched);
		return fetched;
	};
};

export class HttpServiceInstance implements IHttpServiceInstance {
	private readonly defaults: IHttpInstanceOptions;
	public readonly get: IHttpInstanceRequestMethod;
	public readonly post: IHttpInstanceRequestMethod;
	public readonly put: IHttpInstanceRequestMethod;
	public readonly delete: IHttpInstanceRequestMethod;
	public readonly patch: IHttpInstanceRequestMethod;
	public readonly head: IHttpInstanceRequestMethod;
	public readonly options: IHttpInstanceRequestMethod;

	constructor(config: IHttpInstanceOptions = {}) {
		this.defaults = { ...config };
		this.get = makeMethod(HttpInstanceFetchMethods.GET, this.defaults);
		this.post = makeMethod(HttpInstanceFetchMethods.POST, this.defaults);
		this.put = makeMethod(HttpInstanceFetchMethods.PUT, this.defaults);
		this.delete = makeMethod(HttpInstanceFetchMethods.DELETE, this.defaults);
		this.patch = makeMethod(HttpInstanceFetchMethods.PATCH, this.defaults);
		this.head = makeMethod(HttpInstanceFetchMethods.HEAD, this.defaults);
		this.options = makeMethod(HttpInstanceFetchMethods.OPTIONS, this.defaults);
	}
}
