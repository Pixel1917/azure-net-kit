<script lang="ts">
	import type { ILoginRequest } from './Abstracts.js';
	import { ApplicationProvider } from './InfraProvider.js';

	const { authService } = ApplicationProvider();

	const form = $state<Partial<ILoginRequest>>({});

	const onsubmit = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		authService.login(form);
	};
</script>

<form {onsubmit}>
	<input bind:value={form.email} />
	<input bind:value={form.password} />
	<button>submit</button>
</form>
