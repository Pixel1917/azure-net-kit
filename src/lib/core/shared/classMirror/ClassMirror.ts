const MIRROR_TARGET = Symbol('class-mirror-target');
const MIRROR_CACHE = Symbol('class-mirror-cache');

export class ClassMirror {
	private [MIRROR_TARGET]: object;
	private [MIRROR_CACHE]: Map<PropertyKey, unknown>;

	constructor(target: object) {
		this[MIRROR_TARGET] = target;
		this[MIRROR_CACHE] = new Map<PropertyKey, unknown>();

		return new Proxy(this, {
			get(proxyTarget, prop, receiver) {
				if (Reflect.has(proxyTarget, prop)) {
					return Reflect.get(proxyTarget, prop, receiver);
				}

				const mirrorTarget = proxyTarget[MIRROR_TARGET] as object;
				const mirroredValue = Reflect.get(mirrorTarget, prop, mirrorTarget);
				if (typeof mirroredValue !== 'function') {
					return mirroredValue;
				}

				const cache = proxyTarget[MIRROR_CACHE] as Map<PropertyKey, unknown>;
				if (cache.has(prop)) {
					return cache.get(prop);
				}

				const bound = mirroredValue.bind(mirrorTarget);
				cache.set(prop, bound);
				return bound;
			},

			has(proxyTarget, prop) {
				return Reflect.has(proxyTarget, prop) || Reflect.has(proxyTarget[MIRROR_TARGET] as object, prop);
			},

			ownKeys(proxyTarget) {
				return [...new Set([...Reflect.ownKeys(proxyTarget), ...Reflect.ownKeys(proxyTarget[MIRROR_TARGET] as object)])];
			},

			getOwnPropertyDescriptor(proxyTarget, prop) {
				return Reflect.getOwnPropertyDescriptor(proxyTarget, prop) ?? Reflect.getOwnPropertyDescriptor(proxyTarget[MIRROR_TARGET] as object, prop);
			}
		});
	}
}
