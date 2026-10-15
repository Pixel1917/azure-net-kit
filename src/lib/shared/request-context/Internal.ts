import { BROWSER } from '../../external/tools/index.js';
import type { RequestEvent } from '@sveltejs/kit';

declare global {
	// Application-owned declaration merging, matching SvelteKit's App namespace.
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace App {
		// eslint-disable-next-line @typescript-eslint/no-empty-object-type
		interface RequestContextState {}
	}
}

export interface ContextData {
	readonly event: RequestEvent;
	readonly state: App.RequestContextState;
}

let getter: (() => ContextData | undefined) | undefined;
const internals = new WeakMap<ContextData, Record<PropertyKey, unknown>>();

export function initializeRequestContext(resolve: () => ContextData | undefined): void {
	getter = resolve;
}

export function getContextInternals(context: ContextData): Record<PropertyKey, unknown> {
	let data = internals.get(context);
	if (!data) {
		data = {};
		internals.set(context, data);
	}
	return data;
}

export const RequestContext = Object.freeze({
	current(): ContextData {
		if (BROWSER) throw new Error('[AzureNetKit] RequestContext is server-only.');
		const context = getter?.();
		if (!context) throw new Error('[AzureNetKit] No active RequestContext. Use AzureNetPlugin and resolve services inside a request.');
		return context;
	}
});
