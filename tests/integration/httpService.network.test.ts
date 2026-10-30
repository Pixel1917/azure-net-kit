import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpServiceInstance } from '../../src/lib/infra/http-service/HttpServiceInstance.js';
import { initializeRequestContext } from '../../src/lib/shared/request-context/Internal.js';

let server: Server;
let origin: string;
beforeAll(async () => {
	server = createServer(async (req, res) => {
		if (req.url === '/slow') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.write('{');
			return;
		}
		if (req.url === '/refresh') {
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ token: 'new' }));
			return;
		}
		if (req.url === '/auth') {
			res.statusCode = req.headers.authorization === 'Bearer new' ? 200 : 401;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ ok: res.statusCode === 200 }));
			return;
		}
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify({ method: req.method, body: Buffer.concat(chunks).toString(), token: req.headers.authorization }));
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	initializeRequestContext(() => ({ event: { fetch } }) as never);
});
afterAll(async () => {
	if (!server?.listening) return;
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('HttpServiceInstance with native fetch and a real HTTP server', () => {
	it('refreshes and repeats a POST with the same body and new authorization', async () => {
		let token = 'old';
		let attempts = 0;
		const http = new HttpServiceInstance({
			prefixUrl: origin,
			onRequest: (r) => {
				attempts++;
				r.headers.set('authorization', `Bearer ${token}`);
			},
			retry: {
				limit: 1,
				statuses: [401],
				shouldRetry: async ({ http }) => {
					const result = await http.post<{ token: string }>('/refresh', { retry: { limit: 0 } });
					token = result.data.token;
					return true;
				}
			}
		});
		const response = await http.post('/auth', { json: { name: 'Ada' } });
		expect(response.data).toEqual({ ok: true });
		expect(attempts).toBe(3);
	});
	it('times out during body parsing, not just waiting for response headers', async () => {
		await expect(new HttpServiceInstance({ prefixUrl: origin, timeout: 100 }).get('/slow')).rejects.toMatchObject({
			original: { message: 'Request timeout exceeded' }
		});
	});
	it('sends a ReadableStream body through Node fetch', async () => {
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('streamed'));
				controller.close();
			}
		});
		const response = await new HttpServiceInstance({ prefixUrl: origin }).post<{ body: string }>('/echo', { body });
		expect(response.data.body).toBe('streamed');
	});
	it('preserves Unicode JSON and custom headers over the wire', async () => {
		const response = await new HttpServiceInstance({ prefixUrl: origin }).put<{ body: string; token: string }>('/echo', {
			json: { name: '\u0418\u043c\u044f' },
			headers: { authorization: 'Bearer test' }
		});
		expect(JSON.parse(response.data.body)).toEqual({ name: '\u0418\u043c\u044f' });
		expect(response.data.token).toBe('Bearer test');
	});
});
