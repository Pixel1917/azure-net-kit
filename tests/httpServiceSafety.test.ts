import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
import {
	HttpServiceInstance,
	HttpServiceError,
	type IHttpInstanceOptions,
	type IHttpServiceInstance
} from '../src/lib/infra/http-service/HttpServiceInstance.js';

const json = (status = 200, data: unknown = { ok: true }) =>
	new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
	fetchMock = vi.fn<typeof fetch>(async () => json());
	initializeRequestContext(() => ({ event: { fetch: fetchMock } }) as never);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('HTTP serialization and option boundaries', () => {
	it.each(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const)('supports destructured %s', async (method) => {
		const { [method]: send } = new HttpServiceInstance();
		await send('/data');
		expect(fetchMock.mock.calls[0][1]?.method).toBe(method.toUpperCase());
	});
	it.each(['blob', 'arrayBuffer', 'text', 'body'] as const)('supports %s responses', async (responseFormat) => {
		fetchMock.mockImplementation(async () => new Response('abc'));
		const result = await new HttpServiceInstance().get('/data', { responseFormat });
		if (responseFormat === 'text') expect(result.data).toBe('abc');
		if (responseFormat === 'blob') expect(await (result.data as Blob).text()).toBe('abc');
		if (responseFormat === 'arrayBuffer') expect(new TextDecoder().decode(result.data as ArrayBuffer)).toBe('abc');
		if (responseFormat === 'body') expect(await new Response(result.data as ReadableStream).text()).toBe('abc');
	});
	it.each([null, false, 0, '', [], {}])('serializes JSON %j', async (value) => {
		await new HttpServiceInstance().post('/data', { json: value });
		expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify(value));
	});
	it('rejects circular JSON without sending a bodyless write or retrying', async () => {
		const data: Record<string, unknown> = {};
		data.self = data;
		const onError = vi.fn();
		const shouldRetry = vi.fn(() => true);
		await expect(new HttpServiceInstance({ onError, retry: { limit: 2, shouldRetry } }).post('/data', { json: data })).rejects.toBeInstanceOf(
			TypeError
		);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(shouldRetry).not.toHaveBeenCalled();
	});
	it('keeps FormData/body untouched and does not add JSON content-type', async () => {
		const body = new FormData();
		body.set('name', 'Ada');
		await new HttpServiceInstance().post('/data', { body, json: { ignored: true } });
		expect(fetchMock.mock.calls[0][1]?.body).toBe(body);
		expect((fetchMock.mock.calls[0][1]?.headers as Headers).has('content-type')).toBe(false);
	});
	it('isolates Headers objects and does not mutate caller options', async () => {
		const headers = new Headers({ token: 'base' });
		const http = new HttpServiceInstance({
			headers,
			onRequest: (r) => {
				r.headers.set('token', String(r.url));
			}
		});
		await Promise.all([http.get('/one'), http.get('/two')]);
		expect(headers.get('token')).toBe('base');
		expect((fetchMock.mock.calls[0][1]?.headers as Headers).get('token')).toBe('/one');
		expect((fetchMock.mock.calls[1][1]?.headers as Headers).get('token')).toBe('/two');
	});
	it('preserves repeated query keys, false, zero, hash and input params', async () => {
		const searchParams = new URLSearchParams('tag=a&tag=b');
		const http = new HttpServiceInstance({ searchParams });
		await http.get('/items?x=1#section', { searchParams: { page: 0, visible: false, skip: undefined } });
		expect(fetchMock.mock.calls[0][0]).toBe('/items?x=1&tag=a&tag=b&page=0&visible=false#section');
		expect(searchParams.toString()).toBe('tag=a&tag=b');
	});
	it('passes fetch options without leaking hook or retry options to fetch', async () => {
		await new HttpServiceInstance().get('/data', { credentials: 'include', cache: 'no-store', redirect: 'error', retry: { limit: 1 } });
		const init = fetchMock.mock.calls[0][1];
		expect(init).toMatchObject({ credentials: 'include', cache: 'no-store', redirect: 'error' });
		expect(init).not.toHaveProperty('retry');
		expect(init).not.toHaveProperty('onError');
	});
	it('preserves the terminal error instance, accepts validation in onError and exposes no client', async () => {
		const error = new HttpServiceError({ status: 422, data: { name: ['required'] } });
		const http = new HttpServiceInstance({
			doFetch: async () => {
				throw error;
			},
			onError: (context) => {
				expect(Object.keys(context).sort()).toEqual(['error', 'request']);
				context.error.addAsValidation({ name: 'required' });
			}
		});
		await expect(http.post('/data')).rejects.toBe(error);
		expect(error.validation?.getSelfTypedData()).toEqual({ name: 'required' });
	});
});

describe('HTTP cancellation, timeouts and cleanup', () => {
	it.each([NaN, Infinity, -1, 2147483648])('rejects invalid timeout %s', async (timeout) => {
		await expect(new HttpServiceInstance({ timeout }).get('/data')).rejects.toBeInstanceOf(RangeError);
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('does not invoke hooks or fetch for an already aborted request', async () => {
		const controller = new AbortController();
		controller.abort();
		const onRequest = vi.fn();
		await expect(new HttpServiceInstance({ onRequest }).get('/data', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
		expect(onRequest).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it.each(['onRequest', 'onResponse', 'onError', 'shouldRetry'] as const)('can stop waiting for a never-settling %s hook', async (hook) => {
		const controller = new AbortController();
		let enter!: () => void;
		const entered = new Promise<void>((r) => (enter = r));
		const pending = () => {
			enter();
			return new Promise<never>(() => {});
		};
		const config: IHttpInstanceOptions = { timeout: false };
		if (hook === 'shouldRetry') config.retry = { limit: 1, shouldRetry: pending };
		else config[hook] = pending;
		if (hook === 'onError' || hook === 'shouldRetry') fetchMock.mockImplementation(async () => json(401));
		const promise = new HttpServiceInstance(config).get('/data', { signal: controller.signal });
		const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
		await entered;
		controller.abort();
		await assertion;
		expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
	});
	it.each([false, true])('enforces timeout on non-cooperating transport (custom=%s)', async (custom) => {
		vi.useFakeTimers();
		const pending = vi.fn(() => new Promise<never>(() => {}));
		if (!custom) fetchMock.mockImplementation(pending);
		const source = new AbortController();
		const promise = new HttpServiceInstance({ timeout: 10, ...(custom ? { doFetch: pending } : {}) }).get('/data', { signal: source.signal });
		const assertion = expect(promise).rejects.toMatchObject({ original: { message: 'Request timeout exceeded' } });
		await vi.advanceTimersByTimeAsync(10);
		await assertion;
		expect(source.signal.aborted).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('times out while consuming a slow response body', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(async () => new Response(new ReadableStream({ start() {} })));
		const promise = new HttpServiceInstance({ timeout: 10 }).get('/slow');
		const assertion = expect(promise).rejects.toMatchObject({ original: { message: 'Request timeout exceeded' } });
		await vi.advanceTimersByTimeAsync(10);
		await assertion;
		expect(vi.getTimerCount()).toBe(0);
	});
	it.each([200, 401])('clears timers and abort listeners after status %s', async (status) => {
		vi.useFakeTimers();
		const source = new AbortController();
		const add = vi.spyOn(source.signal, 'addEventListener');
		const remove = vi.spyOn(source.signal, 'removeEventListener');
		fetchMock.mockImplementation(async () => json(status));
		const p = new HttpServiceInstance({ timeout: 100, retry: { limit: 2 } }).get('/data', { signal: source.signal });
		if (status === 200) await p;
		else await expect(p).rejects.toMatchObject({ status });
		expect(vi.getTimerCount()).toBe(0);
		for (const [, listener] of add.mock.calls) expect(remove.mock.calls.some((call) => call[1] === listener)).toBe(true);
	});
	it('fresh timeout applies to each retry and exhaustion leaves no timers', async () => {
		vi.useFakeTimers();
		const doFetch = vi.fn(() => new Promise<never>(() => {}));
		const promise = new HttpServiceInstance({ timeout: 10, retry: { limit: 2 }, doFetch }).get('/data');
		const assertion = expect(promise).rejects.toMatchObject({ original: { message: 'Request timeout exceeded' } });
		await vi.advanceTimersByTimeAsync(30);
		await assertion;
		expect(doFetch).toHaveBeenCalledTimes(3);
		expect(vi.getTimerCount()).toBe(0);
	});
	it.each([0, false] as const)('creates no timeout timer for timeout %s', async (timeout) => {
		vi.useFakeTimers();
		await new HttpServiceInstance({ timeout }).get('/data');
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('HTTP bounded retry and hook failures', () => {
	it('runs a large finite retry budget iteratively, with one final onError', async () => {
		const error = new HttpServiceError({ status: 401 });
		const doFetch = vi.fn(async () => {
			throw error;
		});
		const onError = vi.fn();
		await expect(
			new HttpServiceInstance({ timeout: false, doFetch, onError, retry: { limit: 1000, shouldRetry: () => true } }).get('/data')
		).rejects.toBe(error);
		expect(doFetch).toHaveBeenCalledTimes(1001);
		expect(onError).toHaveBeenCalledTimes(1);
	});
	it('does not call shouldRetry recursively for an explicitly disabled nested refresh', async () => {
		fetchMock.mockImplementation(async () => json(401));
		const predicate = vi.fn(async ({ http }: { http: IHttpServiceInstance }) => {
			await http.post('/refresh', { retry: { limit: 0 } });
			return true;
		});
		await expect(new HttpServiceInstance({ retry: { limit: 5, shouldRetry: predicate } }).get('/data')).rejects.toMatchObject({ status: 401 });
		expect(predicate).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it('does not re-enter onError when it throws synchronously', async () => {
		const callbackError = new Error('callback');
		const onError = vi.fn(() => {
			throw callbackError;
		});
		fetchMock.mockImplementation(async () => json(401));
		await expect(new HttpServiceInstance({ onError, retry: { limit: 1 } }).get('/data')).rejects.toBe(callbackError);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it('retains the last HTTP error, not the first failure', async () => {
		fetchMock.mockResolvedValueOnce(json(401, { code: 'expired' })).mockResolvedValueOnce(json(403, { code: 'forbidden' }));
		await expect(new HttpServiceInstance({ retry: { limit: 1 } }).get('/data')).rejects.toMatchObject({ status: 403, data: { code: 'forbidden' } });
	});
});
