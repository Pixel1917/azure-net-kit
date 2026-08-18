import { createApp } from '../src/lib/shared/app/index.js';
import { createAsyncHelpers } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';

const app = createApp((builder) =>
	builder
		.dependencies({ Config: () => ({ errorCode: 'APP_ERROR' }) })
		.useAzureNetKitError(({ Container, error, retry, AppEvents, isClient, isServer, requestContext, event }) => {
			void retry.can;
			void AppEvents;
			void isClient;
			void isServer;
			void requestContext;
			void event;
			return error.toPlainObject({ code: Container.Config.errorCode });
		})
);

void app;

createApp((builder) => {
	const configured = builder.useAzureNetKitError(({ error }) => error.toPlainObject());
	// @ts-expect-error useAzureNetKitError is intentionally available only once in a builder chain.
	configured.useAzureNetKitError(({ error }) => error.toPlainObject());
	return configured;
});

const helpers = createAsyncHelpers<{ code: string }>();
void helpers.createAsyncAction<string, { id: string }>;
// @ts-expect-error Error parsers are configured only through createApp.
void helpers.useHandler;
// @ts-expect-error createAsyncHelpers no longer exposes a parser.
void helpers.errorParser;
