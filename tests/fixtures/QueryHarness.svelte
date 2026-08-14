<script lang="ts">
	import { createQuery, type CreateQueryOptions, type QueryController } from '../../src/lib/svelte/query/Query.svelte.js';

	let {
		initial,
		options,
		setup,
		expose
	}: {
		initial: Record<string, unknown>;
		options?: unknown;
		setup?: (query: QueryController<Record<string, unknown>>) => void;
		expose: (query: QueryController<Record<string, unknown>>) => void;
	} = $props();

	const initialize = () => {
		const query = createQuery(initial, options as CreateQueryOptions<Record<string, unknown>> | undefined);
		setup?.(query);
		expose(query);
	};

	initialize();
</script>
