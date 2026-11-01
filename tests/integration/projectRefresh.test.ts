import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import ts from 'typescript';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { BaseHttpDatasource } from '../../src/lib/infra/datasource/BaseDatasource.js';
import { ResponseBuilder } from '../../src/lib/infra/response/BaseResponse.js';
import { UniversalCookie } from '../../src/lib/shared/cookie/UniversalCookie.js';
import { RequestContext, initializeRequestContext, type ContextData } from '../../src/lib/shared/request-context/Internal.js';

// Opt-in: executes the consumer's actual TS sources against a controlled HTTP backend.
// No credentials, production requests, or changes to the consumer project.
const root = process.env.DREV_PROJECT_ROOT;
describe.skipIf(!root || !existsSync(root))('consumer SessionService refresh (controlled backend)', () => {
	let server: Server;
	let origin: string;
	const storage = new AsyncLocalStorage<ContextData>();
	const traces: string[] = [];
	let mode = 'success';
	let generation = 0;
	let activeAccess = 'valid-0';
	let activeRefresh = 'refresh-0';
	const config = { tokenCookieName: 'access', refreshTokenCookieName: 'refresh', backendApiUrl: '', xSecret: 'test-only' };
	let Datasource: any;
	const cache = new Map<string, any>();
	function load(path: string): any {
		const file = path.endsWith('.ts') ? path : path + '.ts';
		if (cache.has(file)) return cache.get(file);
		const module = { exports: {} as any };
		cache.set(file, module.exports);
		const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
		}).outputText;
		const require = (id: string): any => {
			if (id === '@azure-net/kit/infra') return { BaseHttpDatasource, ResponseBuilder };
			if (id === '@azure-net/kit/tools') return { BROWSER: false };
			if (id === '@azure-net/kit/server-context') return { RequestContext };
			if (id.endsWith('/Configuration')) return { AppConfig: config };
			if (id.endsWith('/Cookies')) return { CookieInstance: UniversalCookie.createInstance({ path: '/' }) };
			if (id.endsWith('/Services')) return load(resolve(root!, 'src/app/ApplicationCore/Services/SessionService.ts'));
			if (id === '#bootstrap/Pipelines/Middlewares')
				return {
					ServerMiddlewares: {
						async execute() {
							traces.push('clear-state');
							(RequestContext.current().state as any).currentUser = undefined;
						}
					},
					ClientMiddlewares: {
						execute() {
							throw new Error('Client middleware on SSR');
						}
					}
				};
			if (id.startsWith('.')) return load(resolve(dirname(file), id));
			throw new Error(`Unexpected test import ${id}`);
		};
		new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
		return module.exports;
	}
	beforeAll(async () => {
		server = createServer(async (req, res) => {
			res.setHeader('content-type', 'application/json');
			const reply = (status: number, data: unknown) => {
				res.statusCode = status;
				res.end(JSON.stringify(data));
			};
			if (req.url === '/api/auth/refresh') {
				traces.push('refresh');
				let raw = '';
				for await (const chunk of req) raw += chunk;
				if (mode === 'refresh-error') return reply(401, { code: 'AUTH_SESSION_EXPIRED', message: 'expired' });
				if (mode === 'refresh-network-error') return reply(503, { message: 'unavailable' });
				if (JSON.parse(raw).refreshToken !== activeRefresh) return reply(409, { code: 'AUTH_REFRESH_CONFLICT' });
				generation++;
				activeAccess = `valid-${generation}`;
				activeRefresh = `refresh-${generation}`;
				return reply(200, { data: { accessToken: activeAccess, refreshToken: activeRefresh } });
			}
			if (req.url === '/public') {
				traces.push('public:200');
				return reply(200, { data: { ok: true } });
			}
			const valid = req.headers.authorization === `Bearer ${activeAccess}` && mode !== 'retry-fails';
			traces.push(valid ? 'me:200' : 'me:401');
			return valid ? reply(200, { data: { id: 'test-user' } }) : reply(401, { code: 'AUTH_ACCESS_TOKEN_EXPIRED', message: 'expired' });
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		config.backendApiUrl = origin;
		initializeRequestContext(() => storage.getStore());
		Datasource = load(resolve(root!, 'src/app/ApplicationCore/Http/ApiDatasource/Datasource.ts')).ApiDatasource;
	});
	afterAll(async () => {
		if (server?.listening) {
			server.closeAllConnections();
			await new Promise<void>((r) => server.close(() => r()));
		}
	});
	function context(access = 'expired', refresh: string | undefined = activeRefresh) {
		const cookies = new Map<string, string>([['access', access]]);
		if (refresh) cookies.set('refresh', refresh);
		const ctx = {
			state: { currentUser: { id: 'test-user' } },
			event: {
				url: new URL('http://localhost/account'),
				request: new Request('http://localhost/account'),
				fetch,
				cookies: { get: (n: string) => cookies.get(n), set: (n: string, v: string) => cookies.set(n, v), delete: (n: string) => cookies.delete(n) }
			}
		} as unknown as ContextData;
		return { cookies, ctx };
	}
	const get = (path = '/api/auth/me') => new Datasource().createRequest(({ http }: any) => http.get(path));
	it('rotates both cookies and retries in the same promise for five consecutive cycles', async () => {
		mode = 'success';
		generation = 0;
		activeAccess = 'valid-0';
		activeRefresh = 'refresh-0';
		const state = context();
		for (let cycle = 1; cycle <= 5; cycle++) {
			traces.length = 0;
			activeAccess = `server-expired-${cycle}`;
			const oldRefresh = state.cookies.get('refresh');
			const result = await storage.run(state.ctx, () => get());
			expect(result.getData()).toEqual({ id: 'test-user' });
			expect(traces).toEqual(['me:401', 'refresh', 'me:200']);
			expect(state.cookies.get('access')).toBe(activeAccess);
			expect(state.cookies.get('refresh')).not.toBe(oldRefresh);
			console.info(`[refresh-test] cycle=${cycle} me=401 refresh=200 retry=200 bothCookiesRotated=true`);
		}
	});
	it('does not refresh a successful public request with an expired access', async () => {
		mode = 'success';
		traces.length = 0;
		await storage.run(context().ctx, () => get('/public'));
		expect(traces).toEqual(['public:200']);
	});
	it('does not refresh without a refresh cookie', async () => {
		traces.length = 0;
		const state = context();
		state.cookies.delete('refresh');
		await expect(storage.run(state.ctx, () => get())).rejects.toBeDefined();
		expect(traces).toEqual(['me:401']);
	});
	it('clears cookies and server state when refresh is expired without recursion', async () => {
		mode = 'refresh-error';
		traces.length = 0;
		const state = context();
		await expect(storage.run(state.ctx, () => get())).rejects.toBeDefined();
		expect(traces).toEqual(['me:401', 'refresh', 'clear-state']);
		expect(state.cookies.get('access')).toBe('');
		expect(state.cookies.get('refresh')).toBe('');
		expect((state.ctx.state as any).currentUser).toBeUndefined();
	});
	it('stops after one retry if the replacement token is also rejected', async () => {
		mode = 'retry-fails';
		traces.length = 0;
		await expect(storage.run(context().ctx, () => get())).rejects.toBeDefined();
		expect(traces).toEqual(['me:401', 'refresh', 'me:401']);
	});
	it('preserves cookies on refresh 503 and does not retry the original request', async () => {
		mode = 'refresh-network-error';
		traces.length = 0;
		const state = context();
		const before = [...state.cookies];
		await expect(storage.run(state.ctx, () => get())).rejects.toBeDefined();
		expect(traces).toEqual(['me:401', 'refresh']);
		expect([...state.cookies]).toEqual(before);
	});
});
