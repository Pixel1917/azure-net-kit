import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { initializeRequestContext, getContextInternals, type ContextData } from '../../shared/request-context/Internal.js';

const storage = new AsyncLocalStorage<ContextData>();
const contexts = new WeakMap<RequestEvent, ContextData>();
initializeRequestContext(() => storage.getStore());

export function runRequest<T>(event: RequestEvent, callback: () => T): T {
	initializeRequestContext(() => storage.getStore());
	const current = storage.getStore();
	if (current?.event === event) return callback();
	let context = contexts.get(event);
	if (!context) {
		context = Object.freeze({ event, state: {} });
		contexts.set(event, context);
		getContextInternals(context).requestId = Symbol('request');
	}
	return storage.run(context, callback);
}
