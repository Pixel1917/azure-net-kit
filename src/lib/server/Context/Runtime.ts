import '$app/server';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { initializeRequestContext, getContextInternals, type ContextData } from '../../shared/request-context/Internal.js';

interface Scope {
	ref: WeakRef<ContextData>;
	active?: ContextData;
	leases: number;
}

// Cached import promises may retain their ALS store forever. The store must not
// strongly own a completed request, while pending work still needs a live context.
const storage = new AsyncLocalStorage<Scope>();
const contexts = new WeakMap<RequestEvent, ContextData>();
const scopes = new WeakMap<ContextData, Scope>();
const currentContext = () => storage.getStore()?.ref.deref();
initializeRequestContext(currentContext);

function release(scope: Scope) {
	if (--scope.leases === 0) scope.active = undefined;
}

function retainResponse(response: Response, scope: Scope): Response {
	if (!response.body) return response;
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body.getReader();
	// Keep this lease on the stream, not the ALS store: abandoned responses must
	// also be collectible without requiring callers to explicitly consume them.
	let context = scope.active;
	const finish = () => {
		if (!reader) return;
		reader.releaseLock();
		reader = undefined;
		context = undefined;
	};
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (!context || !reader) return;
			try {
				const chunk = await storage.run(scope, () => reader!.read());
				if (chunk.done) {
					finish();
					controller.close();
				} else controller.enqueue(chunk.value);
			} catch (error) {
				finish();
				controller.error(error);
			}
		},
		async cancel(reason) {
			try {
				await storage.run(scope, () => reader?.cancel(reason));
			} finally {
				finish();
			}
		}
	});
	const retained = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
	// Fetch response metadata is not copied by the Response constructor.
	Object.defineProperties(retained, {
		url: { value: response.url },
		redirected: { value: response.redirected },
		type: { value: response.type }
	});
	return retained;
}

function complete<T>(value: T, scope: Scope): T {
	try {
		return (value instanceof Response ? retainResponse(value, scope) : value) as T;
	} finally {
		release(scope);
	}
}

function invoke<T>(scope: Scope, callback: () => T): T {
	let value: T;
	let promise: Promise<T> | undefined;
	try {
		value = callback();
		if (value && typeof (value as unknown as PromiseLike<unknown>).then === 'function') promise = Promise.resolve(value);
	} catch (error) {
		release(scope);
		throw error;
	}
	if (promise) {
		return promise.then(
			(result) => complete(result, scope),
			(error: unknown) => {
				release(scope);
				throw error;
			}
		) as T;
	}
	return complete(value, scope);
}

export function runRequest<T>(event: RequestEvent, callback: () => T): T {
	initializeRequestContext(currentContext);
	let context = contexts.get(event);
	if (!context) {
		context = Object.freeze({ event, state: {} });
		contexts.set(event, context);
		getContextInternals(context).requestId = Symbol('request');
	}
	let scope = scopes.get(context);
	if (!scope) {
		scope = { ref: new WeakRef(context), leases: 0 };
		scopes.set(context, scope);
	}
	scope.active = context;
	scope.leases++;
	return storage.run(scope, () => invoke(scope, callback));
}
