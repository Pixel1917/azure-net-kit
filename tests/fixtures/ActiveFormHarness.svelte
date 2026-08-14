<script lang="ts">
	import { createActiveForm, type ActiveForm } from '../../src/lib/svelte/active-form/ActiveForm.svelte.js';
	import { createAsyncSignal, type AsyncSignalSvelte } from '../../src/lib/svelte/async-signal/AsyncSignal.svelte.js';
	import type { AsyncActionResponse } from '../../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';

	type FormData = { name: string };
	type Response = { id: number };
	type Result = AsyncActionResponse<Response, FormData>;

	let {
		request,
		submit,
		expose,
		watch = true
	}: {
		request: () => Promise<FormData>;
		submit: (data: Partial<FormData>) => Promise<Result>;
		expose: (value: { form: ActiveForm<FormData, Response, Record<never, never>>; signal: AsyncSignalSvelte<FormData> }) => void;
		watch?: boolean;
	} = $props();

	const signal = createAsyncSignal(() => request(), { immediate: false });
	const form = createActiveForm((data: Partial<FormData>): Promise<Result> => submit(data), {
		initialValues: ({ linkSignal }) => linkSignal(signal, { watch })
	});

	const initialize = () => expose({ form, signal });
	initialize();
</script>
