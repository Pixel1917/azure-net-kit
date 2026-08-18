import { describe, expect, it, vi } from 'vitest';

vi.mock('@azure-net/tools/environment', async (importOriginal) => ({
	...(await importOriginal<typeof import('@azure-net/tools/environment')>()),
	BROWSER: true
}));
import { createAsyncHelpers } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import { createApp } from '../src/lib/shared/app/index.js';

describe('createApp client error runtime', () => {
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

		const result = await createAsyncHelpers<{ source: string }>().createAsyncAction(async () => {
			throw new Error('client failure');
		});

		expect(result.error?.source).toBe('client');
	});

	it('replaces the client binding instead of accumulating app callbacks', async () => {
		const first = createApp((builder) => builder.useAzureNetKitError(({ error }) => error.toPlainObject({ app: 'first' })));
		const second = createApp((builder) => builder.useAzureNetKitError(({ error }) => error.toPlainObject({ app: 'second' })));
		await first.register.clientInit();
		await second.register.clientInit();

		const result = await createAsyncHelpers<{ app: string }>().createAsyncAction(async () => {
			throw new Error('client failure');
		});

		expect(result.error?.app).toBe('second');
	});

	it('clears a stale client binding when the active app has no custom hook', async () => {
		const configured = createApp((builder) => builder.useAzureNetKitError(({ error }) => error.toPlainObject({ stale: true })));
		await configured.register.clientInit();

		const plain = createApp((builder) => builder);
		await plain.register.clientInit();
		const result = await createAsyncHelpers<{ stale?: boolean }>().createAsyncAction(async () => {
			throw new Error('client failure');
		});

		expect(result.error?.stale).toBeUndefined();
	});
});
