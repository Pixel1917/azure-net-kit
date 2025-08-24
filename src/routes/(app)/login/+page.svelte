<script lang="ts">
	import { enhance } from '$app/forms';
	import { Translation } from '../../../app/core/index.js';
	import { ObjectUtil } from 'azure-net-tools';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from '../../../../.svelte-kit/types/src/routes/(app)/login/$types.js';

	const { t } = Translation();

	let { form }: PageProps = $props();

	const onSubmit: SubmitFunction = () => {
		return async ({ update }) => await update();
	};
</script>

<div class="login-page">
	<div class="login-window">
		<form class="form-container" method="POST" action="?/login" use:enhance={onSubmit}>
			<h1 class="title">{$t('login.title')}</h1>
			<p class="text-default subtitle">{$t('login.subtitle')}</p>
			<input type="email" name="email" placeholder="email" />
			<input type="password" name="password" placeholder="password" />
			<button type="submit">Submit</button>
			{@html ObjectUtil.renderAsString(form?.errors ?? {})}
		</form>
	</div>
</div>

<style>
	.login-page {
		width: 100%;
		height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
</style>
