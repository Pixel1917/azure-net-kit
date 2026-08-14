<script lang="ts">
	import { createEffect, type EffectCleanup } from '../../src/lib/svelte/effect/Effect.svelte.js';

	interface EffectState {
		watched: number;
		ignored: number;
		source: number;
	}

	let {
		mode = 'watched',
		onRun,
		expose
	}: {
		mode?: 'empty' | 'projected' | 'watched';
		onRun: (state: EffectState) => EffectCleanup | Promise<unknown> | void;
		expose: (state: EffectState) => void;
	} = $props();

	const initialize = () => {
		const state = $state<EffectState>({ watched: 0, ignored: 0, source: 0 });
		const dependencies = mode === 'empty' ? [] : mode === 'projected' ? [() => state.source % 2] : [() => state.watched];

		createEffect(() => onRun(state), dependencies);
		expose(state);
	};

	initialize();
</script>
