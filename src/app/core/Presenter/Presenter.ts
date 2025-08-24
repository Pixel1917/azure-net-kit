import { createPresenterFactory } from 'edges-svelte';
import { createAsyncHelpers, createErrorParser } from '$lib/index.js';

const ErrorHandler = createErrorParser();
const AsyncHelpers = createAsyncHelpers({ parseError: ErrorHandler });

export const AppPresenter = createPresenterFactory({ ...AsyncHelpers, handleError: ErrorHandler });
