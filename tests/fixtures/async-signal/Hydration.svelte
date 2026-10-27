<script lang="ts">
	import { untrack } from 'svelte';
	import { createAsyncSignal, type AsyncSignalSvelte } from '../../../src/lib/svelte/async-signal/AsyncSignal.svelte.js';
	let { user, request, expose, beforeSend, onSuccess, onError } = $props<{
		user: string;
		request: () => Promise<string>;
		expose: (signal: AsyncSignalSvelte<string>) => void;
		beforeSend: () => void | Promise<void>;
		onSuccess: (value: string) => void | Promise<void>;
		onError: (error: Error) => void | Promise<void>;
	}>();
	const signal = await createAsyncSignal(() => request(), {
		server: true,
		key: 'user',
		beforeSend: () => beforeSend(),
		onSuccess: (value) => onSuccess(value),
		onError: (error: Error) => onError(error)
	});
	untrack(() => expose(signal));
</script>

<p>{user}: {signal.status}: {signal.response ?? signal.error?.message}</p>
<button onclick={() => signal.refresh()}>Refresh</button>
