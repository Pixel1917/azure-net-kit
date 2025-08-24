import { createMiddlewareManager, type IMiddleware } from '$lib/index.js';
import { ApplicationProvider } from '../../contexts/app/Application/index.js';

const AuthMiddleware: IMiddleware = async ({ next, page, event, isServer, cookies }) => {
	const user = isServer ? event?.locals?.user : page?.data?.user;
	if (isServer && !user && cookies.get('token') && event) {
		const { AuthService } = ApplicationProvider();
		event.locals.user = await AuthService.current();
	}
	next();
};

const GuardMiddleware: IMiddleware = async ({ next, page, event, isServer, to }) => {
	const user = isServer ? event?.locals?.user : page?.data?.user;
	if (!user && !to.pathname.startsWith('/login')) {
		next('/login');
	}
	if (user && to.pathname.startsWith('/login')) {
		next('/');
	}
	next();
};

export const { clientMiddleware, serverMiddleware } = createMiddlewareManager([AuthMiddleware, GuardMiddleware]);
