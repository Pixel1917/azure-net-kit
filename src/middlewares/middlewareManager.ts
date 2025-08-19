import { createMiddlewareManager, type IMiddleware } from '$lib/index.js';

const middlewareTest: IMiddleware = async ({ to, redirect, onClient, onServer }) => {
	if (to.pathname === '/test-middleware') {
		onClient(async ({ context }) => {
			console.log('im here');
			console.log(context.route);
		});
		onServer(async ({ context }) => {
			console.log('im here');
			console.log(context?.locals);
			await redirect('/');
		});
	}
};

export const { clientMiddleware, serverMiddleware } = createMiddlewareManager([middlewareTest]);
