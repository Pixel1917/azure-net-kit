import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@azure-net/edges/context';
import {
	createHttpServiceInstance,
	HttpInstanceFetchMethods,
	type HttpInstanceDoFetch,
	type HttpInstanceNormalizedRequest
} from '../src/lib/core/infra/httpService/HttpServiceInstance.js';
import { HttpServiceError, HttpServiceResponse } from '../src/lib/core/infra/httpService/HttpServiceInstance.js';

const setRequestContextFetch = (fetchImpl: typeof fetch) => {
	RequestContext.init(
		() =>
			({
				event: {
					fetch: fetchImpl,
					url: new URL('https://context.local/current')
				}
			}) as never
	);
};

const jsonResponse = (status: number, data: unknown, headers?: Record<string, string>) => {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'content-type': 'application/json',
			...headers
		}
	});
};

const getFetchCall = (fetchMock: ReturnType<typeof vi.fn>, index = 0) => {
	return fetchMock.mock.calls[index] as unknown as [string | URL | Request, RequestInit | undefined];
};

describe('HttpServiceInstance', () => {
	beforeEach(() => {
		setRequestContextFetch(
			vi.fn(async () => {
				throw new Error('RequestContext fetch not overridden in test');
			}) as unknown as typeof fetch
		);
	});

	it('uses RequestContext fetch and returns parsed json response', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }, { 'x-id': 'r1' }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = createHttpServiceInstance();
		const result = await instance.get<{ ok: boolean }>('https://api.example.com/users');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result).toBeInstanceOf(HttpServiceResponse);
		expect(result.success).toBe(true);
		expect(result.status).toBe(200);
		expect(result.data).toEqual({ ok: true });
		expect(result.headers['x-id']).toBe('r1');
	});

	it('builds url with prefixUrl and merges default/request search params', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = createHttpServiceInstance({
			prefixUrl: 'https://api.example.com/v1/',
			searchParams: { lang: 'ru' }
		});

		await instance.get('users', {
			searchParams: { limit: 10, active: true }
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [input] = getFetchCall(fetchMock);
		expect(input).toBe('https://api.example.com/v1/users?lang=ru&limit=10&active=true');
	});

	it('merges search params for relative url without prefixUrl', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = createHttpServiceInstance({
			searchParams: { fromDefault: 1 }
		});

		await instance.get('/users?existing=yes#hash', {
			searchParams: { fromRequest: 2 }
		});

		const [input] = getFetchCall(fetchMock);
		expect(input).toBe('/users?existing=yes&fromDefault=1&fromRequest=2#hash');
	});

	it('serializes json body and applies content-type + accept headers by default', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(201, { created: true }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = createHttpServiceInstance();
		await instance.post('/users', { json: { name: 'Ada' } });

		const [, init] = getFetchCall(fetchMock);
		expect(init).toBeDefined();
		expect(init!.method).toBe(HttpInstanceFetchMethods.POST);
		expect(init!.body).toBe('{"name":"Ada"}');

		const headers = init!.headers as Headers;
		expect(headers.get('content-type')).toBe('application/json');
		expect(headers.get('accept')).toBe('application/json');
	});

	it('respects custom stringifyJson from request options', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const stringifyJson = vi.fn(() => 'encoded=1');

		const instance = createHttpServiceInstance();
		await instance.post('/encode', {
			json: { a: 1 },
			stringifyJson
		});

		const [, init] = getFetchCall(fetchMock);
		expect(init).toBeDefined();
		expect(stringifyJson).toHaveBeenCalledWith({ a: 1 });
		expect(init!.body).toBe('encoded=1');
	});

	it('calls default onRequest and allows per-request override', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const defaultHook = vi.fn((request: HttpInstanceNormalizedRequest) => {
			request.headers.set('x-from-default', '1');
		});
		const requestHook = vi.fn((request: HttpInstanceNormalizedRequest) => {
			request.headers.set('x-from-request', '1');
		});

		const instance = createHttpServiceInstance({ onRequest: defaultHook });
		await instance.get('/hook-1');
		await instance.get('/hook-2', { onRequest: requestHook });

		expect(defaultHook).toHaveBeenCalledTimes(1);
		expect(requestHook).toHaveBeenCalledTimes(1);

		const firstHeaders = getFetchCall(fetchMock, 0)[1]?.headers as Headers;
		const secondHeaders = getFetchCall(fetchMock, 1)[1]?.headers as Headers;
		expect(firstHeaders.get('x-from-default')).toBe('1');
		expect(secondHeaders.get('x-from-request')).toBe('1');
		expect(secondHeaders.get('x-from-default')).toBeNull();
	});

	it('retries once for retryable HTTP status and then succeeds', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(503, { reason: 'busy' }))
			.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = createHttpServiceInstance({ retry: 1 });
		const result = await instance.get<{ ok: boolean }>('/unstable');

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	it('does not retry abort errors even when retry > 0', async () => {
		const abortError = new Error('aborted');
		abortError.name = 'AbortError';
		const fetchMock = vi.fn(async () => Promise.reject(abortError));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = createHttpServiceInstance({ retry: 3 });
		await expect(instance.get('/timeout')).rejects.toBeInstanceOf(HttpServiceError);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('supports includeRaw and stores one clone result', async () => {
		const clonePayload = { raw: true };
		const clone = vi.fn(() => jsonResponse(200, clonePayload));
		const responseLike = {
			ok: true,
			status: 200,
			headers: new Headers([['x-one', '1']]),
			json: async () => ({ data: true }),
			text: async () => '',
			blob: async () => new Blob(),
			arrayBuffer: async () => new ArrayBuffer(0),
			formData: async () => new FormData(),
			body: null,
			clone
		} as unknown as Response;
		const fetchMock = vi.fn(async () => responseLike);
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = createHttpServiceInstance();
		const result = await instance.get<{ data: boolean }>('/raw', { includeRaw: true });

		expect(clone).toHaveBeenCalledTimes(1);
		expect(result.data).toEqual({ data: true });
		expect(result.raw).toBeDefined();
		await expect(result.raw?.json()).resolves.toEqual(clonePayload);
	});

	it('parses by responseFormat=text', async () => {
		const fetchMock = vi.fn(async () => new Response('plain-text', { status: 200 }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = createHttpServiceInstance();
		const result = await instance.get<string>('/doc', { responseFormat: 'text' });

		expect(result.data).toBe('plain-text');
	});

	it('normalizes unknown errors and passes HttpServiceError to onError', async () => {
		const doFetch = vi.fn(async () => {
			throw new Error('network failed');
		});
		const onError = vi.fn(async (error: HttpServiceError<unknown>) => error);

		const instance = createHttpServiceInstance({
			doFetch,
			onError
		});

		await expect(instance.get('/oops')).rejects.toBeInstanceOf(HttpServiceError);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(HttpServiceError);
		expect(onError.mock.calls[0]?.[0].status).toBe(500);
	});

	it('throws explicit contract error when onError returns non-HttpServiceError', async () => {
		const doFetch = vi.fn(async () => {
			throw new Error('boom');
		});

		const instance = createHttpServiceInstance({
			doFetch,
			onError: async () => ({}) as HttpServiceError<unknown>
		});

		await expect(instance.get('/bad-on-error')).rejects.toMatchObject({
			message: 'onError hook must return HttpServiceError',
			status: 500
		});
	});

	it('supports fully custom doFetch implementation contract', async () => {
		const doFetchSpy = vi.fn();
		const doFetch: HttpInstanceDoFetch = async <T>(request: HttpInstanceNormalizedRequest) => {
			doFetchSpy(request);
			expect(request.method).toBe(HttpInstanceFetchMethods.DELETE);
			expect(request.url).toBe('/custom');
			expect(request.headers).toBeInstanceOf(Headers);
			return new HttpServiceResponse({
				data: { from: 'custom' } as T,
				status: 299,
				success: true,
				headers: { 'x-custom': 'yes' },
				message: 'custom'
			});
		};

		const instance = createHttpServiceInstance({ doFetch });
		const result = await instance.delete<{ from: string }>('/custom');

		expect(doFetchSpy).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(299);
		expect(result.data).toEqual({ from: 'custom' });
		expect(result.headers['x-custom']).toBe('yes');
	});
});
