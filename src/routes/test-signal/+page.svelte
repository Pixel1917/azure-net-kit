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
	const materialsSignal = createAsyncSignal(() => httpService.get<{ id: number; name: string }>('/api/pages/materialy'));

	// const SomeProvider = createProvider('SomeProvider', () => {
	// 	const someAction = async (id: number, data: {id: number}) => await httpService.post(`some-url/${id}`, {json: data});
	// 	return {someAction};
	// });
	//
	// const {someAction} = SomeProvider();
	// const id = 15;
	// const initial = {id: 22};
	//
	// const form = createActiveForm({onSubmit: (data) => {someAction(id, data).then(() => signal.refresh())}, initialData: initial})
</script>

<p>
	{materialsSignal.pending}
	<button onclick={() => materialsSignal.refresh()}>change</button>
	{materialsSignal.status}
	{@html ObjectUtil.renderAsString(materialsSignal.data)}
</p>
<hr />
{signal.pending}
{@html ObjectUtil.renderAsString(signal.data?.data?.name)}
<button onclick={() => signal.execute()}>execute</button>
<button onclick={() => signal.refresh()}>refresh</button>
<button onclick={() => (url = '/api/pages/catalog')}>changeUrl</button>
