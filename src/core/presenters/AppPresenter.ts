import { createErrorHandler, createAsyncHelpers, createPresenterFactory } from '$lib/core/delivery.js';

export type MyKeys = {
	myKey: string;
};

export const AsyncHelpers = createAsyncHelpers<MyKeys>({
	handler: createErrorHandler(async (error, asyncHelperRetry) => {
		const external = error.external ? error.tryToGetExternalError<{ errors: Record<string, string>; code: string }>() : undefined;
		if (external) {
			if (external.data?.code === 'lol') {
				console.log('do something');
			}
			if (external.data?.errors) {
				error.redeclareValidation(external.data.errors);
			}
			if (asyncHelperRetry.can && asyncHelperRetry.call) {
				const retryResult = await asyncHelperRetry.call();
				console.log(retryResult);
			}
		}
		return error.toPlainObject<MyKeys>({ myKey: 'lol' });
	})
});

export const AppPresenter = createPresenterFactory({
	...AsyncHelpers
});
