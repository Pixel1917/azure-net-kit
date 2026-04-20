import { createErrorParser, createAsyncHelpers, createPresenterFactory } from '$lib/core/delivery/index.js';

export const AsyncHelpers = createAsyncHelpers({ parseError: createErrorParser() });

export const AppPresenter = createPresenterFactory({
	...AsyncHelpers
});
