<script lang="ts">
	import type { ILoginRequest } from './Abstracts.js';
	import { ApplicationProvider } from './InfraProvider.js';
	import { event } from '$lib/core/ui/index.js';
	import { createSchemaFactory } from '$lib/core/delivery/schema/index.js';
	import { createRules, validationMessagesI18n } from '$lib/core/delivery/schema/rules/index.js';

	const { authService } = ApplicationProvider();

	const form = $state<Partial<ILoginRequest>>({});

	const schema = createSchemaFactory(createRules(validationMessagesI18n));

	const LoginRequest = schema<ILoginRequest>()
		.rules((rules) => ({
			email: [rules.string(), rules.email()],
			password: [rules.string(), rules.password({ length: 8, numbers: 1, lowerUpperCasePattern: true })]
		}))
		.create();

	const onsubmit = async () => {
		const request = LoginRequest.from(form).json();
		await authService.login(request).then((res) => {
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
