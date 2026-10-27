import { describe, expect, it, vi } from 'vitest';

vi.mock('@azure-net/tools/environment', async (importOriginal) => ({
	...(await importOriginal<typeof import('@azure-net/tools/environment')>()),
	BROWSER: true
}));
import { createAsyncAction as asyncAction } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import { createApp } from '../src/lib/shared/app/index.js';
import { beforeNavigate } from '$app/navigation';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));

describe('async useClient navigation registration', () => {
	it('registers synchronously and reads middleware installed after await', async () => {
		vi.mocked(beforeNavigate).mockClear();
		let resume!: () => void;
		const gate = new Promise<void>((resolve) => {
			resume = resolve;
		});
		const middleware = vi.fn(({ next }) => next());
		const app = createApp((builder) =>
			builder.useClient(async ({ useMiddlewares }) => {
				await gate;
				useMiddlewares([
					class {
						execute = middleware;
					}
				]);
			})
		);
		const pending = app.register();
		expect(beforeNavigate).toHaveBeenCalledTimes(1);
		const navigate = vi.mocked(beforeNavigate).mock.calls.at(-1)![0];
		const navigation = { to: { url: new URL('https://example.com/a') }, from: null, cancel: vi.fn() };
		navigate(navigation as never);
		expect(middleware).not.toHaveBeenCalled();
		resume();
		await pending;
		navigate(navigation as never);
		expect(middleware).toHaveBeenCalledTimes(1);
		app.register();
		expect(beforeNavigate).toHaveBeenCalledTimes(1);
	});

	it('preserves rejected async lifecycle results without delayed registration', async () => {
		vi.mocked(beforeNavigate).mockClear();
		const failure = new Error('initialization failed');
		const app = createApp((builder) =>
			builder.useClient(async () => {
				throw failure;
			})
		);
		const result = app.register();
		expect(beforeNavigate).toHaveBeenCalledTimes(1);
		await expect(result).rejects.toBe(failure);
	});
});

describe('createApp client error runtime', () => {
	it('runs client init without a container or arguments after universal setup', async () => {
		const init = vi.fn();
		const universal = vi.fn(async (context) => {
			expect(context).not.toHaveProperty('Container');
			await Promise.resolve();
			expect(init).not.toHaveBeenCalled();
		});
		const client = vi.fn((context) => expect(context).not.toHaveProperty('Container'));
		const app = createApp((builder) => builder.use(universal).useClientInit(init).useClient(client));
		expect(Object.keys(app)).toEqual(['register']);
		await app.register.clientInit();
		await app.register.clientInit();
		expect(init).toHaveBeenCalledExactlyOnceWith();
		await app.register();
		expect(client).toHaveBeenCalledTimes(1);
	});
	it('binds the application hook during client init', async () => {
		const app = createApp((builder) =>
			builder.useAzureNetKitError(({ error, isClient, isServer, requestContext, event }) => {
				expect(isClient).toBe(true);
				expect(isServer).toBe(false);
				expect(requestContext).toBeUndefined();
				expect(event).toBeUndefined();
				return error.toPlainObject({ source: 'client' });
			})
		);
		await app.register.clientInit();

		const result = await asyncAction<never, never, { source: string }>(async () => {
			throw new Error('client failure');
		});

		expect(result.error?.source).toBe('client');
	});

	it('replaces the client binding instead of accumulating app callbacks', async () => {
		const first = createApp((builder) => builder.useAzureNetKitError(({ error }) => error.toPlainObject({ app: 'first' })));
		const second = createApp((builder) => builder.useAzureNetKitError(({ error }) => error.toPlainObject({ app: 'second' })));
		await first.register.clientInit();
		await second.register.clientInit();

		const result = await asyncAction<never, never, { app: string }>(async () => {
			throw new Error('client failure');
		});

		expect(result.error?.app).toBe('second');
	});

	it('clears a stale client binding when the active app has no custom hook', async () => {
		const configured = createApp((builder) => builder.useAzureNetKitError(({ error }) => error.toPlainObject({ stale: true })));
		await configured.register.clientInit();

		const plain = createApp((builder) => builder);
		await plain.register.clientInit();
		const result = await asyncAction<never, never, { stale?: boolean }>(async () => {
			throw new Error('client failure');
		});

		expect(result.error?.stale).toBeUndefined();
	});
});

describe('Kit 3 client error hooks', () => {
	it('preserves native error categories without synthesizing deprecated fields', async () => {
		const callback = vi.fn();
		const app = createApp((builder) => builder.useClientError(callback));
		for (const input of [
			{ kind: 'unknown', error: new Error('private detail'), event: {} },
			{ kind: 'app', error: { status: 401, message: 'Sign in' }, event: {} },
			{ kind: 'framework', error: { status: 404, message: 'Not found' }, event: {} }
		] as const) {
			await app.register.clientError(input as never);
			const received = callback.mock.calls.at(-1)![0];
			expect(received).toEqual(input);
			expect(received).not.toHaveProperty('status');
			expect(received).not.toHaveProperty('message');
		}
	});
});
