import { RequestContext } from '../../shared/request-context/Internal.js';
import { BROWSER } from '../../external/tools/index.js';

export type ProviderLifecycle = 'scoped' | 'transient' | 'singleton';

export type ProviderMethodKey<T> = Exclude<
	{
		[K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
	}[keyof T],
	'constructor'
>;

export interface RegisterProviderOptions<T> {
	lifecycle?: ProviderLifecycle;
	bindMethods?: boolean | readonly ProviderMethodKey<T>[];
}

const bindInstanceMethods = (instance: object, selection: true | readonly PropertyKey[]) => {
	const descriptors = new Map<PropertyKey, PropertyDescriptor>();
	const selected = selection === true ? undefined : new Set(selection);
	const seen = new Set<PropertyKey>();
	let target: object | null = instance;
	while (target && target !== Object.prototype && target !== Function.prototype) {
		for (const key of selected ?? Reflect.ownKeys(target)) {
			if (key === 'constructor' || seen.has(key)) continue;
			const descriptor = Object.getOwnPropertyDescriptor(target, key);
			if (!descriptor) continue;
			seen.add(key);
			// Never evaluate accessors, including getters returning functions or Svelte state.
			if ('value' in descriptor && typeof descriptor.value === 'function') descriptors.set(key, descriptor);
			else if (selected) throw new TypeError(`[RegisterProvider] Cannot bind non-method ${String(key)}.`);
		}
		if (selected && seen.size === selected.size) break;
		target = Object.getPrototypeOf(target);
	}
	if (selected) {
		for (const key of selected) {
			if (!descriptors.has(key)) throw new TypeError(`[RegisterProvider] Method ${String(key)} was not found or cannot be bound.`);
		}
	}
	// Validate every write before changing ordinary instances, avoiding partial binding on errors.
	for (const key of descriptors.keys()) {
		const own = Object.getOwnPropertyDescriptor(instance, key);
		if (own ? !own.configurable && !own.writable : !Object.isExtensible(instance)) {
			throw new TypeError(`[RegisterProvider] Cannot bind protected method ${String(key)}.`);
		}
	}
	for (const [key, descriptor] of descriptors) {
		Object.defineProperty(instance, key, { ...descriptor, value: Function.prototype.bind.call(descriptor.value, instance) });
	}
};

/**
 * Registration is safe at module scope; the factory is called only by the returned accessor.
 * scoped: per request on the server, per call in the browser.
 * singleton: per request on the server, per registration in the browser.
 * transient: a new instance on every call.
 * No hydration, component context, effects or disposal are managed by this function.
 */
export function RegisterProvider<T extends object>(
	factory: () => T extends PromiseLike<unknown> ? never : T,
	options: RegisterProviderOptions<NoInfer<T>> = {}
): () => T {
	if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('[RegisterProvider] Options must be an object.');
	const { lifecycle = 'scoped', bindMethods = false } = options;
	if (!['scoped', 'transient', 'singleton'].includes(lifecycle)) {
		throw new TypeError(`[RegisterProvider] Unknown lifecycle: ${lifecycle}`);
	}
	if (typeof bindMethods !== 'boolean' && !Array.isArray(bindMethods))
		throw new TypeError('[RegisterProvider] bindMethods must be a boolean or method list.');
	const selection = Array.isArray(bindMethods) ? [...bindMethods] : bindMethods;
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
			if (selection === true || (Array.isArray(selection) && selection.length > 0)) bindInstanceMethods(instance, selection);
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
