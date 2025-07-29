type Factory<T> = () => T;

export class DIContainer {
	private factories = new Map<new (...args: unknown[]) => unknown, Factory<unknown>>();
	private instances = new Map<new (...args: unknown[]) => unknown, unknown>();

	register<T>(token: new (...args: unknown[]) => T, factory: Factory<T>): void {
		this.factories.set(token, factory);
	}

	get<T>(token: new (...args: unknown[]) => T): T {
		if (this.instances.has(token)) {
			return this.instances.get(token) as T;
		}

		const factory = this.factories.get(token);
		if (!factory) {
			throw new Error(`Factory for ${token.name} not registered`);
		}

		const instance = factory();
		this.instances.set(token, instance);
		return instance as T;
	}
}
