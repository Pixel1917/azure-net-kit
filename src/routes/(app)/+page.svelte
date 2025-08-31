<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from '../../../.svelte-kit/types/src/routes/(app)/$types.js';
	import { ScriptPresenter } from '../../app/contexts/app/Delivery/Script/index.js';
	import { createActiveForm, createAsyncSignal } from '$lib/index.js';
	import { ObjectUtil } from 'azure-net-tools';

	const { data }: PageProps = $props();
	const { collection } = ScriptPresenter();

	let page = $state(1);
	const signal = createAsyncSignal(() => collection(), {
		immediate: false,
		initialData: data.scripts,
		watch: [() => page]
	});

	const { create } = ScriptPresenter();
	const form = createActiveForm<ReturnType<typeof create>>((formData) => create(formData));
</script>

<form action="?/logout" method="post" use:enhance>
	<button>logout</button>
</form>

Hello kitty
{form.data.name}

{@html ObjectUtil.renderAsString(signal.data?.data ?? {})}

<button onclick={() => page++}>page change</button>
