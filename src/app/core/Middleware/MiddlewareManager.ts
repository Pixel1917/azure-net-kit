import { createMiddlewareManager, type IMiddleware } from '$lib/index.js';
import { ApplicationProvider } from '../../contexts/app/Application/Providers/index.js';
import { CurrentUser } from '../../contexts/app/Delivery/Auth/index.js';

const AuthMiddleware: IMiddleware = async ({ next, page, event, isServer, cookies }) => {
	const user = isServer ? event?.locals?.user : page?.data?.user;
	if (isServer && !user && cookies.get('token') && event) {
		const { AuthService } = ApplicationProvider();
		event.locals.user = await AuthService.current().then((r) => {
			const { user } = CurrentUser();
			user.value = r;
			return r;
		});
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
