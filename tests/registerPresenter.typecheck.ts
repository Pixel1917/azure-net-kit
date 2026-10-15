import { RegisterProvider, createAsyncAction, createAsyncResource } from '../src/lib/delivery/index.js';

class Presenter {
	constructor(readonly name: string) {}
}

const usePresenter = RegisterProvider(() => new Presenter('test'), 'scoped');
const typed: () => Presenter = usePresenter;
void typed;

// @ts-expect-error Unknown lifecycle is rejected.
RegisterProvider(() => new Presenter('test'), 'global');
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
