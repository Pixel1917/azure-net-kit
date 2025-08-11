export class ClassMirror<Target extends object> {
	constructor(target: Target) {
		const proto = Object.getPrototypeOf(target) as object;

		for (const name of Object.getOwnPropertyNames(proto)) {
			if (name === 'constructor') continue;

			const descriptor = Object.getOwnPropertyDescriptor(proto, name);
			if (!descriptor || typeof descriptor.value !== 'function') continue;
			if (name in this) continue;

			Object.defineProperty(this, name, {
				value: descriptor.value.bind(target),
				configurable: true,
				writable: true
			});
		}
	}
}
