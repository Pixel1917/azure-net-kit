import { RequestContext } from '../../shared/request-context/Internal.js';
import { BROWSER } from '../../external/tools/index.js';

export type ProviderLifecycle = 'scoped' | 'transient' | 'singleton';

/**
 * Registration is safe at module scope; the factory is called only by the returned accessor.
 * scoped: per request on the server, per call in the browser.
 * singleton: per request on the server, per registration in the browser.
 * transient: a new instance on every call.
 * No hydration, component context, effects or disposal are managed by this function.
 */
export function RegisterProvider<T extends object>(
	factory: () => T extends PromiseLike<unknown> ? never : T,
	lifecycle: ProviderLifecycle = 'scoped'
): () => T {
	if (!['scoped', 'transient', 'singleton'].includes(lifecycle)) {
		throw new TypeError(`[RegisterProvider] Unknown lifecycle: ${lifecycle}`);
	}
	const requests = new WeakMap<object, T>();
	let clientInstance: T | undefined;
	let constructing = false;
	const create = (): T => {
		if (constructing) throw new Error('[RegisterProvider] Circular presenter dependency.');
		constructing = true;
		try {
			const instance = factory();
			if (!instance || (typeof instance !== 'object' && typeof instance !== 'function')) {
				throw new TypeError('[RegisterProvider] Factory must return an instance.');
			}
			if ('then' in instance && typeof instance.then === 'function') {
				// Consume a rejected async factory without allowing an unhandled rejection.
				void Promise.resolve(instance).catch(() => undefined);
				throw new TypeError('[RegisterProvider] Factory must be synchronous.');
			}
			return instance;
		} finally {
			constructing = false;
		}
	};
	return () => {
		if (lifecycle === 'transient') return create();
		if (BROWSER) return lifecycle === 'singleton' ? (clientInstance ??= create()) : create();
		// Weak keys do not retain finished requests or their presenter graphs.
		const context = RequestContext.current();
		let instance = requests.get(context);
		if (!instance) {
			instance = create();
			requests.set(context, instance);
		}
		return instance;
	};
}
