import { beforeNavigate } from '$app/navigation';
import { expectTypeOf } from 'vitest';
import {
	ServerMiddlewareManager,
	ClientMiddlewareManager,
	CompositionRoot,
	createApp,
	createAsyncSignal,
	type AsyncSignalSvelte,
	type IClientMiddleware,
	type ClientMiddlewareContext,
	type IServerMiddleware,
	type ServerMiddlewareContext
} from '@azure-net/kit';
import { TranslationManager } from '@azure-net/kit/i18n';

const translations = new TranslationManager({
	messages: { en: async () => ({ title: 'Hello' }), ru: async () => ({ title: 'Привет' }) },
	initLang: 'en'
});
export const { t } = translations;
const context = new CompositionRoot({ register: () => ({ user: () => ({ id: 1 }) }) });
class ServerGuard implements IServerMiddleware {
	execute({ next }: ServerMiddlewareContext) {
		return next();
	}
}
class ClientGuard implements IClientMiddleware {
	execute({ next }: ClientMiddlewareContext) {
		return next('/login', { replace: true, reset: false });
	}
}
createApp((app) => {
	app.useTranslations(translations);
	app.useServer(async () => {
		await new ServerMiddlewareManager([ServerGuard]).execute();
	});
	app.useClient(() => beforeNavigate((navigation) => new ClientMiddlewareManager([ClientGuard]).execute(navigation)));
});
function consumerTypes() {
	expectTypeOf(context.resolve().user.id).toEqualTypeOf<number>();
	expectTypeOf(translations.locale).toEqualTypeOf<'en' | 'ru'>();
	expectTypeOf(t('title')).toEqualTypeOf<string>();
	expectTypeOf(createAsyncSignal(async () => 1)).toEqualTypeOf<AsyncSignalSvelte<number>>();
	expectTypeOf(createAsyncSignal(async () => 1, { server: true, key: 'number' })).toEqualTypeOf<Promise<AsyncSignalSvelte<number>>>();
	// @ts-expect-error Locale names remain inferred from dictionary keys.
	translations.switchLocale('de');
}
void consumerTypes;
