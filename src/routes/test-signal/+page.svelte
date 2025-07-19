<script lang="ts">
	import { createAsyncSignal } from '$lib/svelte/index.js';
	import { HttpService, HttpServiceResponse } from '$lib/index.js';
	import { ObjectUtil } from 'azure-net-tools';

	const httpService = new HttpService({ baseUrl: 'https://admin.drevproektstroi.ru' });

	let url = $state('/api/pages/home');
	const signal = createAsyncSignal(() => httpService.get<{ id: number; name: string }>(url), {
		watch: [() => url],
		immediate: false,
		initialData: new HttpServiceResponse<{ id: number; name: string }>({
			success: true,
			status: 200,
			headers: {},
			message: 'done',
			data: { id: 1, name: 'Главная' }
		})
	});
	const signal2 = createAsyncSignal(() => httpService.get<{ id: number; name: string }>('/api/pages/materialy'));
</script>

<p>
	{signal2.pending}
	{@html ObjectUtil.renderAsString(signal2.data)}
</p>
<hr />
{signal.pending}
{@html ObjectUtil.renderAsString(signal.data?.data?.name)}

<button onclick={() => signal.execute()}>execute</button>
<button onclick={() => signal.refresh()}>refresh</button>
<button onclick={() => (url = '/api/pages/catalog')}>changeUrl</button>
