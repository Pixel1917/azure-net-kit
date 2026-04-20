import { createMiddlewareManager, type IMiddleware } from '$lib/core/index.js';

const RoutesGuard: IMiddleware = async ({ next, to, cookies }) => {
	const token = cookies.get('mock-token');
	if (to.pathname !== '/login' && !token) {
		return next('/login');
	}
	return next();
};

export const { clientMiddleware, serverMiddleware, executeMiddlewares } = createMiddlewareManager([RoutesGuard]);
