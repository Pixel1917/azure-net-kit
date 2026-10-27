import type { IClientMiddleware, ClientMiddlewareContext, ClientMiddlewareClass } from '../src/lib/shared/app/middleware/ClientMiddleware.js';
import type { IServerMiddleware, ServerMiddlewareContext } from '../src/lib/shared/app/middleware/ServerMiddleware.js';
class SyncMiddleware implements IClientMiddleware {
	execute({ next }: ClientMiddlewareContext) {
		return next('/login', { replace: true, reset: false, refreshAll: true, shallow: false });
	}
}
class AsyncMiddleware implements IClientMiddleware {
	// @ts-expect-error Client navigation must be decided synchronously.
	async execute({ next }: ClientMiddlewareContext) {
		next();
	}
}
class ServerMiddleware implements IServerMiddleware {
	async execute({ next, event }: ServerMiddlewareContext) {
		await Promise.resolve(event.url);
		next();
	}
}
const classes: readonly ClientMiddlewareClass[] = [SyncMiddleware];
// @ts-expect-error Pass constructors, not instances.
const instances: ClientMiddlewareClass[] = [new SyncMiddleware()];
// @ts-expect-error Callback functions are no longer middleware classes.
const callbacks: ClientMiddlewareClass[] = [() => undefined];
void [classes, instances, callbacks, AsyncMiddleware, ServerMiddleware];
