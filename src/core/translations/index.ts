import { messages } from './locales/index.js';
import { createTranslations, type Path } from '$lib/external/i18n/index.js';

export const TranslationManager = createTranslations({
	messages,
	initLang: 'en',
	initLangFromAcceptLanguage: true,
	cookieName: 'current-test-language'
});

type MessagesList = Awaited<ReturnType<(typeof messages)[keyof typeof messages]>>;
type TranslationExtended = { key: MessageKeys | string; vars?: Record<string, unknown> };

export type MessageKeys = Path<MessagesList>;
export type TranslationParam = MessageKeys | string | TranslationExtended;
export type AvailableLocales = keyof typeof messages;
