<script lang="ts">
	import { createAsyncSignal, createQuery } from '$lib/svelte/index.js';
	import { PublicPresenter, PublicStore } from '../../../app/mock-api-context/layers/delivery/public/index.js';
	import type { PageProps } from '../../../../.svelte-kit/types/src/routes/(app)/login/$types.js';
	import { Container } from '../../../program.js';

	const { storeValue, translationManager } = Container;

	const { setNewVal } = PublicStore();
	const { t, switchLocale, locale } = translationManager;

	let { data }: PageProps = $props();

	const { collection, willFail } = PublicPresenter();

	const query = createQuery({ page: 1, perPage: 20, ivan: { collection: [] } }, { syncWithSearchParams: true });

	const signal = createAsyncSignal(() => collection(), {
		immediate: false,
		initialData: () => data.collection
	});

	const failSignal = createAsyncSignal(() => willFail(), {
		immediate: false
	});

	query.createEffect(() => {
		if (!signal.pending) {
			signal.refresh();
		}
	}, ['ivan.collection', 'page', 'perPage']);
</script>

<a href="/">kra</a>
{storeValue.value}
<button onclick={() => setNewVal()}>new val</button>
<button onclick={() => switchLocale($locale === 'ru' ? 'en' : 'ru')}>changeLocale</button>
<div class="login-page">
	<!--	{@html ObjectUtil.renderAsString(user.value)}-->
	<div class="login-window">
		<form class="form-container">
			<h1 class="title">{$t('login.title')}</h1>
			<!--			<p class="text-default subtitle">{$t('login.subtitle')}</p>-->
			<!--			<input type="email" name="email" placeholder="email" />-->
			<!--			<input type="password" name="password" placeholder="password" />-->
			<!--			<button type="submit">Submit</button>-->
			<!--			{@html ObjectUtil.renderAsString(form?.errors ?? {})}-->
		</form>
	</div>
</div>
{$t('publicData')}
<br />

<button onclick={() => failSignal.execute()}>test fail signal</button>

{#if signal.response && !signal.pending}
	{$t({ key: 'count', vars: { count: signal.response.meta?.count ?? 1 } })}
	<br />
	{#each signal.response.data as dataEl (dataEl.id)}
		<p>id: {dataEl.id}</p>
		<p>name: {dataEl.name}</p>
		<p>price: {dataEl.price}</p>
		<p>quantity: {dataEl.quantity}</p>
		<hr />
	{/each}
	<button onclick={() => signal.refresh()}>refresh</button>
{/if}
