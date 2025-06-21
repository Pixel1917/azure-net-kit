import { messages } from './locales/index.js';
import { createTranslations } from '$lib/i18n/index.js';

export const TranslationProvider = createTranslations({ messages, initLang: 'ru', initLangFromAcceptLanguage: true, cookieName: 'lang' });
