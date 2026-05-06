<script lang="ts">
	import { register } from '../program.js';
	import type { Snippet } from 'svelte';

	register();
	const { children }: { children: Snippet } = $props();
</script>

<div class="layout">
	<div class="page">
		{@render children()}
	</div>
</div>
