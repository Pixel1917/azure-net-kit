<script lang="ts">
	import { PrivatePresenter } from '../../app/mock-api-context/layers/delivery/private/index.js';
	import { createAsyncSignal } from '$lib/core/svelte/index.js';
	import { TranslationManager } from '../../core/translations/index.js';
	import type { PageProps } from '../../../.svelte-kit/types/src/routes/(app)/$types.js';

	const { t } = TranslationManager();

	const { data }: PageProps = $props();
	const { collection } = PrivatePresenter();

	const signal = createAsyncSignal(() => collection(), {
		immediate: false,
		initialData: () => data.collection
	});
</script>

{$t('privateData')}
{#if signal.data}
	{$t({ key: 'count', vars: { count: signal.data.meta?.count ?? 1 } })}
	<br />
	{#each signal.data.data as dataEl (dataEl.id)}
		<p>id: {dataEl.id}</p>
		<p>privateData: {dataEl.privateData}</p>
		<hr />
	{/each}
	<button onclick={() => signal.refresh()}>refresh</button>
{/if}
