<script lang="ts">
	import type { ILoginRequest } from './Abstracts.js';
	import { ApplicationProvider } from './InfraProvider.js';

	const { authService } = ApplicationProvider();

	const form = $state<Partial<ILoginRequest>>({});

	const onsubmit = async (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		await authService.login(form).then((res) => {
			console.log(res);
		});
	};
</script>

<form {onsubmit}>
	<input bind:value={form.email} />
	<input bind:value={form.password} />
	<button>submit</button>
</form>
