<script lang="ts">
	import { BaseRequest, type RequestErrors } from '$lib/core/request/index.js';
	import { ObjectUtil } from 'azure-net-tools';
	import { Rules } from '$lib/core/request/rules/index.js';
	import { validationMessagesI18n } from '$lib/core/request/rules/messages/index.js';
	import { TranslationProvider } from '../../translation/index.js';
	import { compose, preventDefault, stopPropagation } from '$lib/core/eventModifiers/index.js';

	type ITestRequest = {
		name: string;
		user: {
			id?: number;
		};
		pass: string;
		cPass: string;
		arr: { id: number; name: string }[];
	};

	const rules = new Rules(validationMessagesI18n);

	class TestRequest extends BaseRequest<ITestRequest> {
		rules() {
			return {
				name: [rules.required(), rules.string({ length: { min: 3, max: 5 } }), rules.lettersOnly({ whiteSpaces: true })],
				'user.id': [rules.required(), rules.number()],
				pass: [rules.required(), rules.sameAs({ key: 'cPass' })],
				cPass: [rules.required()],
				arr: [
					rules.required(),
					rules.array({
						length: { min: 1, max: 5 },
						schema: { name: [rules.required(), rules.string()], id: [rules.required(), rules.number({ range: { min: 1 } })] }
					})
				]
			};
		}
	}

	const form = $state<ITestRequest>({
		name: '',
		user: {
			id: undefined
		},
		pass: '',
		cPass: '',
		arr: []
	});

	let errors = $state<RequestErrors<ITestRequest>>({});

	const onSubmit = () => {
		const req = new TestRequest(form);
		try {
			console.log(req.json());
			errors = {};
		} catch (e) {
			if (e instanceof TestRequest) {
				errors = e.getErrors();
			}
		}
	};

	const { t, locale } = TranslationProvider();
</script>

{$locale}
{@html ObjectUtil.renderAsString(errors)}
<form onsubmit={compose(preventDefault, stopPropagation)(onSubmit)}>
	<input type="text" bind:value={form.name} placeholder="name" />
	{$t(errors?.name)}
	<input type="text" placeholder="id" bind:value={form.user.id} />
	{$t(errors?.user?.id)}
	{$t(errors?.arr?.[0]?.id)}
	{@html ObjectUtil.renderAsString(form.arr)}
	<button type="button" onclick={() => form.arr.push({ id: 1, name: 'digger' })}>add el</button>
	<button>submit</button>
</form>
