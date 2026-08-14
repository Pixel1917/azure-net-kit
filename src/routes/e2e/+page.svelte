<script lang="ts">
	import { createQuery } from '../../lib/svelte/query/Query.svelte.js';

	let count = $state(0);
	const query = createQuery({ page: 1, enabled: false }, { syncWithSearchParams: true });
</script>

<svelte:head><title>AzureNet Kit E2E</title></svelte:head>

<main>
	<h1>AzureNet Kit E2E</h1>
	<p data-testid="count">{count}</p>
	<button onclick={() => (count += 1)}>Increment</button>
	<p data-testid="query-page">{query.data.page}</p>
	<p data-testid="query-enabled">{query.data.enabled}</p>
	<button onclick={() => (query.data.page += 1)}>Next query page</button>
</main>
