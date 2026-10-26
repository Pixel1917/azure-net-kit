import { RegisterProvider, createAsyncAction, createAsyncResource } from '../src/lib/delivery/index.js';

class Presenter {
	constructor(readonly name: string) {}
}

const usePresenter = RegisterProvider(() => new Presenter('test'), { lifecycle: 'scoped' });
const typed: () => Presenter = usePresenter;
void typed;

// @ts-expect-error Unknown lifecycle is rejected.
RegisterProvider(() => new Presenter('test'), { lifecycle: 'global' });
// @ts-expect-error Promises cannot be registered as presenter instances.
RegisterProvider(async () => new Presenter('test'));
// @ts-expect-error Presenter factories must return an object.
RegisterProvider(() => 123);

const action = createAsyncAction(async () => ({ id: 1 }));
const resource: Promise<{ id: number }> = createAsyncResource(async () => ({ id: 1 }));
const custom = createAsyncAction<string, { login: string }, { code: string }>(async () => 'ok');
void action.then((result) => {
	const id: number = result.response.id;
	return id;
});
void custom.then((result) => {
	const code: string | undefined = result.error?.code;
	return code;
});
void resource;

class Bindable {
	value = 1;
	get current() {
		return this.value;
	}
	run(amount: number) {
		return this.value + amount;
	}
	async load() {
		return this.value;
	}
}
RegisterProvider(() => new Bindable(), { bindMethods: ['run', 'load'] });
RegisterProvider(() => new Bindable(), { bindMethods: true });
// @ts-expect-error Non-method fields cannot be selected.
RegisterProvider(() => new Bindable(), { bindMethods: ['value'] });
// @ts-expect-error Non-method getters cannot be selected.
RegisterProvider(() => new Bindable(), { bindMethods: ['current'] });
// @ts-expect-error Unknown methods cannot widen the factory's return type.
RegisterProvider(() => new Bindable(), { bindMethods: ['missing'] });
// @ts-expect-error Constructor is never an instance method to bind.
RegisterProvider(() => new Bindable(), { bindMethods: ['constructor'] });
// @ts-expect-error The old positional lifecycle is no longer accepted.
RegisterProvider(() => new Bindable(), 'scoped');
