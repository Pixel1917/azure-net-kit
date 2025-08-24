import { createMiddlewareManager, type IMiddleware } from '$lib/index.js';

const middlewareTest: IMiddleware = async ({ to, from, next, isServer }) => {
	if (to.pathname === '/test-middleware') {
		if (from?.pathname === '/test-layer') {
			return next('/');
		}
		if (isServer) {
			return next('/');
		}
	}
	if (!isServer) {
		console.log('im navigating');
	}
	return next();
};

export const { clientMiddleware, serverMiddleware } = createMiddlewareManager([middlewareTest]);
