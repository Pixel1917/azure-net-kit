export class ProxyResourceService<TRepo extends object> {
	protected repository: TRepo;

	constructor(repo: TRepo) {
		this.repository = repo;

		const proto = Object.getPrototypeOf(repo) as object;

		for (const name of Object.getOwnPropertyNames(proto)) {
			if (name === 'constructor') continue;

			const descriptor = Object.getOwnPropertyDescriptor(proto, name);
			if (!descriptor || typeof descriptor.value !== 'function') continue;
			if (name in this) continue;

			Object.defineProperty(this, name, {
				value: descriptor.value.bind(repo),
				configurable: true,
				writable: true
			});
		}
	}
}
