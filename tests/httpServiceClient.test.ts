import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@azure-net/tools/environment', async (original) => ({ ...(await original<object>()), BROWSER: true }));
import { HttpServiceInstance } from '../src/lib/infra/http-service/HttpServiceInstance.js';
import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
afterEach(() => vi.unstubAllGlobals());
describe('browser HTTP requests', () => {
	it('uses browser fetch, never requests server context, and retries with the same client', async () => {
		const context = vi.fn(() => {
			throw new Error('Server context accessed in browser');
		});
		initializeRequestContext(context);
		let attempts = 0;
		const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: ++attempts > 1 }), { status: attempts === 1 ? 401 : 200 }));
		vi.stubGlobal('fetch', fetcher);
		const http = new HttpServiceInstance({
			retry: {
				limit: 1,
				shouldRetry: ({ http: client }) => {
					expect(client).toBe(http);
					return true;
				}
			}
		});
		await expect(http.get('/data')).resolves.toMatchObject({ data: { ok: true } });
		expect(context).not.toHaveBeenCalled();
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
	it('delivers a terminal error as a destructured context without http', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}', { status: 403 }))
		);
		const onError = vi.fn(({ error, request, ...rest }) => {
			expect(error.status).toBe(403);
			expect(request.url).toBe('/private');
			expect(rest).toEqual({});
		});
		await expect(new HttpServiceInstance({ onError }).get('/private')).rejects.toMatchObject({ status: 403 });
		expect(onError).toHaveBeenCalledTimes(1);
	});
});
