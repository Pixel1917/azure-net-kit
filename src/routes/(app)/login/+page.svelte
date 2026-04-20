<script lang="ts">
	import { TranslationManager } from '../../../core/translations/index.js';
	import { createAsyncSignal } from '$lib/core/svelte/index.js';
	import { PublicPresenter } from '../../../app/mock-api-context/layers/delivery/public/index.js';
	import type { PageProps } from '../../../../.svelte-kit/types/src/routes/(app)/login/$types.js';

	const { t } = TranslationManager();

	let { data }: PageProps = $props();

	const { collection } = PublicPresenter();

	const signal = createAsyncSignal(() => collection(), {
		immediate: false,
		initialData: () => data.collection
	});
</script>

<!--<div class="login-page">-->
<!--	{@html ObjectUtil.renderAsString(user.value)}-->
<!--	<div class="login-window">-->
<!--		<form class="form-container" method="POST" action="?/login" use:enhance={onSubmit}>-->
<!--			<h1 class="title">{$t('login.title')}</h1>-->
<!--			<p class="text-default subtitle">{$t('login.subtitle')}</p>-->
<!--			<input type="email" name="email" placeholder="email" />-->
<!--			<input type="password" name="password" placeholder="password" />-->
<!--			<button type="submit">Submit</button>-->
<!--			{@html ObjectUtil.renderAsString(form?.errors ?? {})}-->
<!--		</form>-->
<!--	</div>-->
<!--</div>-->
{$t('publicData')}
<br />

{#if signal.data && !signal.pending}
	{$t({ key: 'count', vars: { count: signal.data.meta?.count ?? 1 } })}
	<br />
	{#each signal.data.data as dataEl (dataEl.id)}
		<p>id: {dataEl.id}</p>
		<p>name: {dataEl.name}</p>
		<p>price: {dataEl.price}</p>
		<p>quantity: {dataEl.quantity}</p>
		<hr />
	{/each}
	<button onclick={() => signal.refresh()}>refresh</button>
{/if}
