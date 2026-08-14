import { untrack } from 'svelte';

export type EffectCleanup = () => void;
export type EffectCallback = () => EffectCleanup | Promise<unknown> | void;
export type EffectDependency<T = unknown> = () => T;

export const createEffect = (callback: EffectCallback, dependencies: readonly EffectDependency[]): void => {
	let cleanup: EffectCleanup | undefined;
	let initialized = false;
	let previousValues: unknown[] = [];

	$effect(() => {
		const values = dependencies.map((dependency) => dependency());
		const changed = !initialized || values.some((value, index) => !Object.is(value, previousValues[index]));

		if (!changed) return;

		initialized = true;
		previousValues = values;

		untrack(() => {
			cleanup?.();
			cleanup = undefined;

			const result = callback();
			if (typeof result === 'function') cleanup = result;
		});
	});

	$effect(() => {
		return () => {
			untrack(() => cleanup?.());
			cleanup = undefined;
		};
	});
};
