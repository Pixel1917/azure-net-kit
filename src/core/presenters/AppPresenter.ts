import { createAsyncHelpers, createPresenterFactory } from '$lib/delivery.js';

export type MyKeys = {
	myKey: string;
};

export const AsyncHelpers = createAsyncHelpers<MyKeys>();

export const AppPresenter = createPresenterFactory({
	...AsyncHelpers
});
