import { RegisterProvider } from '#lib/delivery.js';

export const AppPresenter = <T extends object>(
	_name: string,
	factory: (dependencies: Record<never, never>) => T extends PromiseLike<unknown> ? never : T
) => RegisterProvider(() => factory({}), { lifecycle: 'singleton' });
