import { createApp } from '../src/lib/shared/app/index.js';
import { createAsyncAction as asyncAction } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';

const app = createApp((builder) =>
	builder.useAzureNetKitError(({ error, retry, isClient, isServer, requestContext, event }) => {
		void retry.can;
		void isClient;
		void isServer;
		void requestContext;
		void event;
		return error.toPlainObject({ code: 'APP_ERROR' });
	})
);

void app;

// @ts-expect-error createApp no longer exposes a DI container.
void app.Container;
createApp((builder) => {
	// @ts-expect-error Dependencies belong in standalone boundary providers.
	void builder.dependencies;
	return builder.use((context) => {
		// @ts-expect-error Lifecycle contexts no longer contain a DI container.
		void context.Container;
	});
});

createApp((builder) => {
	const configured = builder.useAzureNetKitError(({ error }) => error.toPlainObject());
	// @ts-expect-error useAzureNetKitError is intentionally available only once in a builder chain.
	configured.useAzureNetKitError(({ error }) => error.toPlainObject());
	return configured;
});

const helpers = { createAsyncAction: asyncAction<never, never, { code: string }> };
void asyncAction<string, { id: string }, { code: string }>;
// @ts-expect-error Error parsers are configured only through createApp.
void helpers.useHandler;
// @ts-expect-error Helpers do not expose an error parser.
void helpers.errorParser;

createApp((builder) => {
	// @ts-expect-error Boot must finish synchronously before children render.
	builder.useBoot(async () => {});
	const configured = builder.useBoot(({ state }) => {
		void state;
	});
	// @ts-expect-error Boot can be configured once.
	configured.useBoot(() => {});
});
