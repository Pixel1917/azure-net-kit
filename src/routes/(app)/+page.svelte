<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from '../../../.svelte-kit/types/src/routes/(app)/$types.js';
	import { ScriptPresenter } from '../../app/contexts/app/Delivery/Script/index.js';
	import { createActiveForm, createAsyncSignal } from '$lib/index.js';
	import { ObjectUtil } from 'azure-net-tools';
	import { CurrentUser } from '../../app/contexts/app/Delivery/Auth/index.js';

	const { data }: PageProps = $props();
	const { collection } = ScriptPresenter();

	let query = $state({ page: 1, 'per-page': 2 });
	const signal = createAsyncSignal(() => collection(query), {
		immediate: false,
		initialData: data.scripts,
		watch: [() => query.page, () => query['per-page']]
	});

	const { create } = ScriptPresenter();
	const form = createActiveForm<ReturnType<typeof create>>((formData) => create(formData));
	const { user } = CurrentUser();
</script>

<form action="?/logout" method="post" use:enhance>
	<button>logout</button>
</form>

-----
{@html ObjectUtil.renderAsString(user.value)}
----- Hello kitty
{form.data.name}

{@html ObjectUtil.renderAsString(signal.data ?? {})}

<button onclick={() => query.page++}>page change</button>
