import { createApp } from '../src/lib/shared/app/index.js';
import { createAsyncAction as asyncAction } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';

const app = createApp((builder) => builder);

void app;

// @ts-expect-error createApp no longer exposes a DI container.
void app.Container;
createApp((builder) => {
	// @ts-expect-error Dependencies belong in standalone boundary providers.
	void builder.dependencies;
	// @ts-expect-error Universal lifecycle hook has been removed.
	void builder.use;
	return builder.useServer((context) => {
		// @ts-expect-error Lifecycle contexts no longer contain a DI container.
		void context.Container;
	});
});

createApp((builder) => {
	// @ts-expect-error Global helper error resolution has been removed.
	void builder.useAzureNetKitError;
});

const helpers = { createAsyncAction: asyncAction<never, never, { code: string }> };
void asyncAction<string, { id: string }, { code: string }>;
// @ts-expect-error Helpers do not expose global error handlers.
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
