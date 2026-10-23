export function Bound<This, Args extends unknown[], Return>(
	method: (this: This, ...args: Args) => Return,
	context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
) {
	context.addInitializer(function () {
		Object.defineProperty(this, context.name, {
			value: method.bind(this),
			configurable: true,
			writable: true
		});
	});
}
