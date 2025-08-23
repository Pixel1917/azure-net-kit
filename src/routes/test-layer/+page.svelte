<script lang="ts">
	import type { ILoginRequest } from './Abstracts.js';
	import { ApplicationProvider } from './InfraProvider.js';
	import { event } from '$lib/core/ui/index.js';

	const { authService } = ApplicationProvider();

	const form = $state<Partial<ILoginRequest>>({});

	const onsubmit = async () => {
		await authService.login(form).then((res) => {
			console.log(res);
		});
	};
</script>

<form action="/">
	<input bind:value={form.email} />
	<input bind:value={form.password} />
	<button type="submit">submit btn</button>
	<button type="button" onclick={event.prevent.stop(() => onsubmit())}>button btn</button>
</form>
<a href="/test-middleware">middleware</a>
