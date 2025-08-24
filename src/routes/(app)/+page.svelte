<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from '../../../.svelte-kit/types/src/routes/(app)/$types.js';
	import { ScriptPresenter } from '../../app/contexts/app/Delivery/Script/index.js';
	import { createAsyncSignal } from '$lib/index.js';
	import { ObjectUtil } from 'azure-net-tools';

	const { data }: PageProps = $props();
	const { collection } = ScriptPresenter();

	let page = $state(1);
	const signal = createAsyncSignal(() => collection(), {
		immediate: false,
		initialData: data.scripts,
		watch: [() => page]
	});
</script>

<form action="?/logout" method="post" use:enhance>
	<button>logout</button>
</form>

Hello kitty

{@html ObjectUtil.renderAsString(signal.data?.data ?? {})}

<button onclick={() => page++}>page change</button>
