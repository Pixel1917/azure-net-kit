<script lang="ts">
	let { data } = $props();
</script>

<h1>AzureNetPlugin fixture</h1>
<p data-testid="result">{data.marker}:{data.initialized}</p>
<p data-testid="hooks">{data.fetched}:{data.transported.value}</p>
