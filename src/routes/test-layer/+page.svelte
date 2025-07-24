<script lang="ts">
	import { AuthService } from './AuthService.js';
	import type { ILoginRequest } from './Abstracts.js';

	const authService = new AuthService();

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
