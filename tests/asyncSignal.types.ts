import { expectTypeOf } from 'vitest';
import {
	createAsyncSignal,
	createAsyncSignalBatch,
	type AsyncSignalOptions,
	type AsyncSignalSvelte
} from '../src/lib/svelte/async-signal/AsyncSignal.svelte.js';

// Compile-only assertions: hydratable creation belongs in component initialization.
export function asyncSignalTypes(options: AsyncSignalOptions<number>) {
	const handler = async () => 42;
	expectTypeOf(createAsyncSignal(handler)).toEqualTypeOf<AsyncSignalSvelte<number>>();
	expectTypeOf(createAsyncSignal(handler, { server: false })).toEqualTypeOf<AsyncSignalSvelte<number>>();
	expectTypeOf(createAsyncSignal(handler, { server: true, key: 'stable' })).toEqualTypeOf<Promise<AsyncSignalSvelte<number>>>();
	expectTypeOf(createAsyncSignal(handler, options)).toEqualTypeOf<AsyncSignalSvelte<number> | Promise<AsyncSignalSvelte<number>>>();
	// @ts-expect-error server mode requires an explicit key
	createAsyncSignal(handler, { server: true });
	// @ts-expect-error a possibly enabled server mode still requires discrimination
	createAsyncSignal(handler, { server: Math.random() > 0.5 });
	const batch = createAsyncSignalBatch((create) => [create<number>(handler), create<string>(async () => 'text', { server: false })]);
	expectTypeOf(batch.execute()).toEqualTypeOf<readonly [AsyncSignalSvelte<number>, AsyncSignalSvelte<string>]>();
	// @ts-expect-error deferred batches cannot capture a component hydration context
	createAsyncSignalBatch((create) => [create(handler, { server: true, key: 'stable' })]);
}
