<script lang="ts">
	import { createQuery, type CreateQueryOptions, type QueryController } from '../../src/lib/svelte/query/Query.svelte.js';

	let {
		initial,
		options,
		expose
	}: {
		initial: Record<string, unknown>;
		options: CreateQueryOptions<Record<string, unknown>>;
		expose: (query: QueryController<Record<string, unknown>>) => void;
	} = $props();

	const initialize = () => expose(createQuery(initial, options));
	initialize();
</script>
