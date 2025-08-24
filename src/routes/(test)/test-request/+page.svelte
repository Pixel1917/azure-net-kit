<script lang="ts">
	import { ObjectUtil } from 'azure-net-tools';
	import { Translation } from '../../../app/core/Translation/index.js';
	import { event } from '$lib/core/ui/index.js';
	import { createSchemaFactory, type RequestErrors } from '$lib/core/delivery/schema/index.js';
	import { createRules, validationMessagesI18n } from '$lib/core/delivery/schema/rules/index.js';

	type ITestRequest = {
		name: string;
		user: {
			id?: number;
		};
		pass: string;
		cPass: string;
		arr: { id: number; name: string }[];
	};

	const schema = createSchemaFactory(createRules(validationMessagesI18n));
	const TestSchema = schema<ITestRequest>()
		.rules((rules) => ({
			name: [rules.required(), rules.string({ length: { min: 3, max: 5 } }), rules.lettersOnly({ whiteSpaces: true })],
			'user.id': [rules.required(), rules.number()],
			arr: [
				rules.required(),
				rules.array({
					length: { min: 1, max: 5 },
					schema: { name: [rules.required(), rules.string()], id: [rules.required(), rules.number({ range: { min: 1 } })] }
				})
			]
		}))
		.with(() => ({
			fromSomeObj: () =>
				<ITestRequest>{
					name: '',
					user: {
						id: undefined
					},
					pass: '',
					cPass: '',
					arr: []
				}
		}))
		.create();

	const form = $state<ITestRequest>(TestSchema.fromSomeObj());
	let errors = $state<RequestErrors<ITestRequest>>({});

	const onSubmit = () => {
		const req = TestSchema.from($state.snapshot(form));
		try {
			console.log(req.json());
			errors = {};
		} catch (e) {
			errors = TestSchema.getSchemaError(e) ?? {};
		}
	};

	const { t, locale } = Translation();
</script>

{$locale}
{@html ObjectUtil.renderAsString(errors)}
<form onsubmit={event.prevent.stop(onSubmit)}>
	<input type="text" bind:value={form.name} placeholder="name" />
	{$t(errors?.name)}
	<input type="text" placeholder="id" bind:value={form.user.id} />
	{$t(errors?.user?.id)}
	{$t(errors?.arr?.[0]?.id)}
	{@html ObjectUtil.renderAsString(form.arr)}
	<button type="button" onclick={() => form.arr.push({ id: 1, name: 'digger' })}>add el</button>
	<button>submit</button>
</form>
