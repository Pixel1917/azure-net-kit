import { messages } from './locales/index.js';
import { TranslationManager as TranslationManagerClass, type Path } from '#lib/i18n/index.js';

export const TranslationManager = new TranslationManagerClass({
	messages,
	initLang: 'en',
	initLangFromAcceptLanguage: true,
	cookieName: 'current-test-language'
});

export const { t } = TranslationManager;

type MessagesList = Awaited<ReturnType<(typeof messages)[keyof typeof messages]>>;
type TranslationExtended = { key: MessageKeys | string; vars?: Record<string, unknown> };

export type MessageKeys = Path<MessagesList>;
export type TranslationParam = MessageKeys | string | TranslationExtended;
export type AvailableLocales = keyof typeof messages;
