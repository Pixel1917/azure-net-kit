import { expectTypeOf } from 'vitest';
import { createApp, type AppConfiguration } from '@azure-net/kit';
import type { AppConfiguration as DirectAppConfiguration } from '../src/lib/shared/app/index.js';
// @ts-expect-error The fluent builder type has been removed.
import type { CreateAppBuilder } from '@azure-net/kit';
expectTypeOf<CreateAppBuilder>();

expectTypeOf<keyof AppConfiguration>().toEqualTypeOf<keyof DirectAppConfiguration>();
expectTypeOf<Parameters<typeof createApp>[0]>().toEqualTypeOf<(app: AppConfiguration) => void>();
type MethodReturns = { [Key in keyof AppConfiguration]: ReturnType<AppConfiguration[Key]> };
expectTypeOf<MethodReturns>().toEqualTypeOf<Record<keyof AppConfiguration, void>>();
type DirectMethodReturns = { [Key in keyof DirectAppConfiguration]: ReturnType<DirectAppConfiguration[Key]> };
expectTypeOf<DirectMethodReturns>().toEqualTypeOf<MethodReturns>();

createApp((app) => {
	expectTypeOf(app).toEqualTypeOf<AppConfiguration>();
	app.useClient(async () => {});
	app.useServer(async () => {});
	app.useServerInit(async () => {});
	app.useClientInit(async () => {});
	// Repeated calls remain type-valid; duplicate registration is enforced at runtime.
	app.useClient(() => {});
	// @ts-expect-error Imperative registration does not return another configuration.
	app.useServer(() => {}).useClient(() => {});
});
