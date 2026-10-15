<script lang="ts">
	import { register, TranslationManager } from '../program.js';
	import { useBootState } from '../BootState.svelte.js';
	import type { Snippet } from 'svelte';
	const { children }: { children: Snippet } = $props();
	register();
	const state = useBootState();
</script>

<p>{TranslationManager().t('title')}</p>
<p data-testid="boot-state">{state.value}</p>
{@render children()}
