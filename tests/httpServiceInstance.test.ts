import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	HttpServiceInstance,
	HttpInstanceFetchMethods,
	type IHttpInstanceDoFetch,
	type IHttpInstanceNormalizedRequest
} from '../src/lib/infra/http-service/HttpServiceInstance.js';
import { HttpServiceError, HttpServiceResponse } from '../src/lib/infra/http-service/HttpServiceInstance.js';

const setRequestContextFetch = (fetchImpl: typeof fetch) => {
	initializeRequestContext(
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

		const instance = new HttpServiceInstance();
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

		const instance = new HttpServiceInstance({
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

		const instance = new HttpServiceInstance({
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

		const instance = new HttpServiceInstance();
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

		const instance = new HttpServiceInstance();
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

		const defaultHook = vi.fn((request: IHttpInstanceNormalizedRequest) => {
			request.headers.set('x-from-default', '1');
		});
		const requestHook = vi.fn((request: IHttpInstanceNormalizedRequest) => {
			request.headers.set('x-from-request', '1');
		});

		const instance = new HttpServiceInstance({ onRequest: defaultHook });
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

		const instance = new HttpServiceInstance({ retry: { limit: 1 } });
		const result = await instance.get<{ ok: boolean }>('/unstable');

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ ok: true });
	});

	it('does not retry non-transient HTTP errors', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(404, { reason: 'missing' }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = new HttpServiceInstance({ retry: { limit: 3, statuses: [503] } });
		await expect(instance.get('/missing')).rejects.toMatchObject({ status: 404, type: 'external' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('retries fetch network failures', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('network failed'))
			.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = new HttpServiceInstance({ retry: { limit: 1 } });
		const result = await instance.get<{ ok: boolean }>('/network');

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.data).toEqual({ ok: true });
	});

	it('does not retry abort errors even when retry > 0', async () => {
		const abortError = new Error('aborted');
		abortError.name = 'AbortError';
		const fetchMock = vi.fn(async () => Promise.reject(abortError));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = new HttpServiceInstance({ retry: { limit: 3 } });
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
			text: async () => JSON.stringify({ data: true }),
			blob: async () => new Blob(),
			arrayBuffer: async () => new ArrayBuffer(0),
			formData: async () => new FormData(),
			body: null,
			clone
		} as unknown as Response;
		const fetchMock = vi.fn(async () => responseLike);
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = new HttpServiceInstance();
		const result = await instance.get<{ data: boolean }>('/raw', { includeRaw: true });

		expect(clone).toHaveBeenCalledTimes(1);
		expect(result.data).toEqual({ data: true });
		expect(result.raw).toBeDefined();
		await expect(result.raw?.json()).resolves.toEqual(clonePayload);
	});

	it('parses by responseFormat=text', async () => {
		const fetchMock = vi.fn(async () => new Response('plain-text', { status: 200 }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = new HttpServiceInstance();
		const result = await instance.get<string>('/doc', { responseFormat: 'text' });

		expect(result.data).toBe('plain-text');
	});

	it('accepts successful 204 responses without attempting json parsing', async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const result = await new HttpServiceInstance().delete('/resource');

		expect(result.status).toBe(204);
		expect(result.data).toBeUndefined();
	});

	it('accepts successful 200 responses with an empty json body', async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const result = await new HttpServiceInstance().get('/empty');

		expect(result.status).toBe(200);
		expect(result.data).toBeUndefined();
	});

	it('accepts empty HEAD responses without attempting json parsing', async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const result = await new HttpServiceInstance().head('/resource');

		expect(result.status).toBe(200);
		expect(result.data).toBeUndefined();
	});

	it('keeps external error type for non-ok response even when json parsing fails', async () => {
		const fetchMock = vi.fn(async () => new Response('not-json', { status: 500, statusText: 'Server Error' }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = new HttpServiceInstance();
		await expect(instance.get('/broken-json')).rejects.toMatchObject({
			type: 'external',
			status: 500
		});
	});

	it('uses internal error type for parse failure on successful status', async () => {
		const fetchMock = vi.fn(async () => new Response('not-json', { status: 200 }));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);

		const instance = new HttpServiceInstance();
		await expect(instance.get('/parse-failed')).rejects.toMatchObject({
			type: 'internal',
			status: 200
		});
	});

	it('normalizes unknown errors and passes HttpServiceError to onError', async () => {
		const doFetch = vi.fn(async () => {
			throw new Error('network failed');
		});
		const onError = vi.fn(async () => {});

		const instance = new HttpServiceInstance({
			doFetch,
			onError
		});

		await expect(instance.get('/oops')).rejects.toBeInstanceOf(HttpServiceError);
		expect(onError).toHaveBeenCalledTimes(1);
		const firstCallError = (onError.mock.calls[0] as unknown as [{ error: HttpServiceError<unknown> }])[0].error;
		expect(firstCallError).toBeInstanceOf(HttpServiceError);
		expect(firstCallError.status).toBe(500);
	});

	it('keeps original normalized error when onError is side-effect only', async () => {
		const doFetch = vi.fn(async () => {
			throw new Error('boom');
		});

		const instance = new HttpServiceInstance({
			doFetch,
			onError: async () => {}
		});

		await expect(instance.get('/bad-on-error')).rejects.toMatchObject({
			message: 'boom',
			status: 500
		});
	});

	it('supports fully custom doFetch implementation contract', async () => {
		const doFetchSpy = vi.fn();
		const doFetch: IHttpInstanceDoFetch = async <T>(request: IHttpInstanceNormalizedRequest) => {
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

		const instance = new HttpServiceInstance({ doFetch });
		const result = await instance.delete<{ from: string }>('/custom');

		expect(doFetchSpy).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(299);
		expect(result.data).toEqual({ from: 'custom' });
		expect(result.headers['x-custom']).toBe('yes');
	});
});

describe('HTTP retry policy', () => {
	it.each([undefined, { limit: 0 }, { limit: 2, statuses: [] }])('does not retry with %j', async (retry) => {
		const fetchMock = vi.fn(async () => jsonResponse(401, {}));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const predicate = vi.fn(async () => true);
		const options = retry ? { ...retry, shouldRetry: predicate } : undefined;
		await expect(new HttpServiceInstance({ retry: options }).get('/data')).rejects.toMatchObject({ status: 401 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(predicate).not.toHaveBeenCalled();
	});
	it('limits retries for any failed status and notifies only about the final failure', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(404, {}));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const predicate = vi.fn(async () => true);
		const onError = vi.fn();
		await expect(new HttpServiceInstance({ retry: { limit: 2, shouldRetry: predicate }, onError }).get('/data')).rejects.toMatchObject({
			status: 404
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(predicate).toHaveBeenCalledTimes(2);
		expect(onError).toHaveBeenCalledTimes(1);
	});
	it('checks statuses before invoking the predicate', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(403, {}));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const predicate = vi.fn(async () => true);
		await expect(new HttpServiceInstance({ retry: { limit: 2, statuses: [401], shouldRetry: predicate } }).get('/data')).rejects.toMatchObject({
			status: 403
		});
		expect(predicate).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it('awaits refresh using the same client, re-reads headers, and resolves the original promise', async () => {
		let token = 'old';
		const seen: string[] = [];
		const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
			const auth = (init.headers as Headers).get('authorization');
			seen.push(`${url}:${auth}`);
			if (url === '/refresh') return jsonResponse(200, { token: 'new' });
			return auth === 'new' ? jsonResponse(200, { ok: true }) : jsonResponse(401, { code: 'EXPIRED' });
		});
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const onError = vi.fn();
		const onResponse = vi.fn();
		const http = new HttpServiceInstance({
			onRequest: (request) => {
				request.headers.set('authorization', token);
				request.headers.append('x-once', '1');
			},
			onError,
			retry: {
				limit: 1,
				statuses: [401],
				shouldRetry: async ({ error }) => {
					expect(error.data).toEqual({ code: 'EXPIRED' });
					const result = await http.post<{ token: string }>('/refresh', { retry: { limit: 0 } });
					token = result.data.token;
					return true;
				}
			}
		});
		const result = await http.post('/data', { json: { id: 1 }, onResponse });
		expect(result.data).toEqual({ ok: true });
		expect(seen).toEqual(['/data:old', '/refresh:old', '/data:new']);
		expect(onError).not.toHaveBeenCalled();
		expect(onResponse).toHaveBeenCalledTimes(1);
		expect(getFetchCall(fetchMock, 2)[1]?.body).toBe('{"id":1}');
		expect((getFetchCall(fetchMock, 2)[1]?.headers as Headers).get('x-once')).toBe('1');
	});
	it('stops when shouldRetry returns false', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(401, {}));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const predicate = vi.fn(async () => false);
		await expect(new HttpServiceInstance({ retry: { limit: 3, shouldRetry: predicate } }).get('/data')).rejects.toMatchObject({ status: 401 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(predicate).toHaveBeenCalledTimes(1);
	});
	it('replaces the whole inherited retry policy', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(404, {}));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const predicate = vi.fn(async () => false);
		const http = new HttpServiceInstance({ retry: { limit: 5, statuses: [401], shouldRetry: predicate } });
		await expect(http.get('/data', { retry: { limit: 1 } })).rejects.toMatchObject({ status: 404 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(predicate).not.toHaveBeenCalled();
		await expect(http.get('/data', { retry: { limit: 0 } })).rejects.toMatchObject({ status: 404 });
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
	it.each([NaN, Infinity, -1, 1.5])('rejects invalid retry limit %s before sending', async (limit) => {
		const doFetch = vi.fn();
		await expect(new HttpServiceInstance({ retry: { limit }, doFetch }).get('/data')).rejects.toBeInstanceOf(RangeError);
		expect(doFetch).not.toHaveBeenCalled();
	});
	it('does not recycle policy callback exceptions', async () => {
		const failure = new Error('refresh failed');
		const doFetch = vi.fn(async () => {
			throw new HttpServiceError({ status: 401 });
		});
		const predicate = vi.fn(async () => {
			throw failure;
		});
		await expect(new HttpServiceInstance({ doFetch, retry: { limit: 3, shouldRetry: predicate } }).get('/data')).rejects.toBe(failure);
		expect(doFetch).toHaveBeenCalledTimes(1);
		expect(predicate).toHaveBeenCalledTimes(1);
	});
	it('does not retry refresh with an explicit zero limit when refresh itself fails', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(401, {}));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const predicate = vi.fn(async () => {
			await http.post('/refresh', { retry: { limit: 0 } });
			return true;
		});
		const http = new HttpServiceInstance({ retry: { limit: 1, shouldRetry: predicate } });
		await expect(http.get('/data')).rejects.toMatchObject({ status: 401 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(predicate).toHaveBeenCalledTimes(1);
	});
	it('does not retry onResponse failures', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, {}));
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const failure = new Error('callback');
		const onError = vi.fn();
		await expect(
			new HttpServiceInstance({
				retry: { limit: 3 },
				onError,
				onResponse: () => {
					throw failure;
				}
			}).post('/data')
		).rejects.toBe(failure);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
	});
	it('does not retry onRequest failures', async () => {
		const doFetch = vi.fn();
		const failure = new Error('callback');
		await expect(
			new HttpServiceInstance({
				retry: { limit: 3 },
				doFetch,
				onRequest: () => {
					throw failure;
				}
			}).get('/data')
		).rejects.toBe(failure);
		expect(doFetch).not.toHaveBeenCalled();
	});
	it('honors abort while waiting for shouldRetry', async () => {
		const controller = new AbortController();
		const doFetch = vi.fn(async () => {
			throw new HttpServiceError({ status: 401 });
		});
		await expect(
			new HttpServiceInstance({
				doFetch,
				retry: {
					limit: 3,
					shouldRetry: async () => {
						controller.abort();
						return true;
					}
				}
			}).get('/data', { signal: controller.signal })
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(doFetch).toHaveBeenCalledTimes(1);
	});
	it('never replays a streaming body', async () => {
		const doFetch = vi.fn(async () => {
			throw new HttpServiceError({ status: 401 });
		});
		const predicate = vi.fn(async () => true);
		const body = new ReadableStream({
			start(controller) {
				controller.close();
			}
		});
		await expect(new HttpServiceInstance({ doFetch, retry: { limit: 3, shouldRetry: predicate } }).post('/data', { body })).rejects.toMatchObject({
			status: 401
		});
		expect(doFetch).toHaveBeenCalledTimes(1);
		expect(predicate).not.toHaveBeenCalled();
	});
	it('does not let a callback extend the active retry budget', async () => {
		const retry = {
			limit: 1,
			shouldRetry: async () => {
				retry.limit = 100;
				return true;
			}
		};
		const doFetch = vi.fn(async () => {
			throw new HttpServiceError({ status: 401 });
		});
		await expect(new HttpServiceInstance({ doFetch, retry }).get('/data')).rejects.toMatchObject({ status: 401 });
		expect(doFetch).toHaveBeenCalledTimes(2);
	});
});

describe('SSR retry isolation', () => {
	it('keeps credentials and retry counts local for a shared HTTP instance', async () => {
		const { AsyncLocalStorage } = await import('node:async_hooks');
		type Session = { token: string; calls: number; event: { fetch: typeof fetch } };
		const storage = new AsyncLocalStorage<Session>();
		initializeRequestContext(() => storage.getStore() as never);
		const http = new HttpServiceInstance({
			onRequest: (request) => {
				request.headers.set('authorization', storage.getStore()!.token);
			},
			retry: {
				limit: 1,
				statuses: [401],
				shouldRetry: async () => {
					const session = storage.getStore()!;
					await new Promise((resolve) => setTimeout(resolve, 1));
					session.token += '-refreshed';
					return true;
				}
			}
		});
		const results = await Promise.all(
			Array.from({ length: 30 }, (_, index) => {
				const initial = `user-${index}`;
				const session: Session = {
					token: initial,
					calls: 0,
					event: {
						fetch: (async (_url, init) => {
							session.calls++;
							expect((init!.headers as Headers).get('authorization')).toBe(session.token);
							return jsonResponse(session.calls === 1 ? 401 : 200, { user: session.token });
						}) as typeof fetch
					}
				};
				return storage.run(session, async () => {
					const response = await http.get<{ user: string }>('/private');
					expect(session.calls).toBe(2);
					expect(response.data.user).toBe(`${initial}-refreshed`);
					return response.data.user;
				});
			})
		);
		expect(new Set(results).size).toBe(30);
		storage.disable();
	});
});

describe('HTTP client access in hooks', () => {
	beforeEach(() => setRequestContextFetch(fetch));
	it('passes the same instance to default and overridden hooks', async () => {
		const fail = vi.fn(async () => {
			throw new HttpServiceError({ status: 401 });
		});
		const shouldRetry = vi.fn(async ({ http }) => {
			expect(http).toBe(instance);
			return false;
		});
		const onError = vi.fn((context) => {
			expect(context.error.status).toBe(401);
			expect(context.request.url).toMatch(/^\/(default|override)$/);
			expect(context).not.toHaveProperty('http');
		});
		const instance = new HttpServiceInstance({ doFetch: fail, retry: { limit: 1, shouldRetry }, onError });
		await expect(instance.get('/default')).rejects.toMatchObject({ status: 401 });
		const overrideRetry = vi.fn(shouldRetry.getMockImplementation()!);
		const overrideError = vi.fn(onError.getMockImplementation()!);
		await expect(instance.get('/override', { retry: { limit: 1, shouldRetry: overrideRetry }, onError: overrideError })).rejects.toMatchObject({
			status: 401
		});
		expect(overrideRetry).toHaveBeenCalledTimes(1);
		expect(overrideError).toHaveBeenCalledTimes(1);
	});
	it('refreshes through the supplied client and returns the retried result', async () => {
		let refreshed = false;
		const fetchMock = vi.fn(async (url: string) => {
			if (url === '/refresh') {
				refreshed = true;
				return jsonResponse(200, {});
			}
			return jsonResponse(refreshed ? 200 : 401, { ok: refreshed });
		});
		setRequestContextFetch(fetchMock as unknown as typeof fetch);
		const instance = new HttpServiceInstance({
			retry: {
				limit: 1,
				shouldRetry: async ({ http }) => {
					expect(http).toBe(instance);
					await http.post('/refresh', { retry: { limit: 0 } });
					return true;
				}
			}
		});
		await expect(instance.get('/data')).resolves.toMatchObject({ data: { ok: true } });
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});
