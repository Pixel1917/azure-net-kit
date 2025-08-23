import { createMiddlewareManager, type IMiddleware } from '$lib/index.js';

const middlewareTest: IMiddleware = async ({ to, from, next, event, page, isServer }) => {
	const data = isServer ? event?.locals : page.data;
	if (to.pathname === '/test-middleware') {
		if (from?.pathname === '/test-layer') {
			return next('/');
		}
	}
	if (data?.lang) {
		console.log(data.lang);
	}
	return next();
};

export const { clientMiddleware, serverMiddleware } = createMiddlewareManager([middlewareTest]);
