import { createServerAction } from '$lib/index.js';
import { ApplicationProvider } from '../../Application/Providers/index.js';
import { LoginSchema } from './Schema/index.js';
import { CurrentUser } from './Current.js';

export const LoginAction = createServerAction(async ({ context, utils }) => {
	const { AuthService } = ApplicationProvider();
	const { fail, redirect } = utils;
	const data = await context.request.formData();
	try {
		const res = await AuthService.login(LoginSchema.from(data).json());
		context.cookies.set('token', res.token, { path: '/', httpOnly: false });
		return redirect(301, '/');
	} catch (e) {
		const fromSchema = LoginSchema.getSchemaError(e);
		if (fromSchema) {
			return fail(422, { errors: fromSchema });
		}
		throw e;
	}
});

export const LogoutAction = createServerAction(async ({ context, utils }) => {
	const { AuthService } = ApplicationProvider();
	const { redirect } = utils;
	await AuthService.logout();
	context.cookies.delete('token', { path: '/' });
	context.locals.user = undefined;
	const { user } = CurrentUser();
	user.value = undefined;
	return redirect(301, '/login');
});
