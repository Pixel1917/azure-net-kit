<script lang="ts">
	let count = $state(0);
</script>

<svelte:head><title>AzureNet Kit E2E</title></svelte:head>

<main>
	<h1>AzureNet Kit E2E</h1>
	<p data-testid="count">{count}</p>
	<button onclick={() => (count += 1)}>Increment</button>
</main>
