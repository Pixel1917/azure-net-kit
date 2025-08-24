import { messages } from './Locales/index.js';
import { createTranslations } from '$lib/i18n/index.js';

export const Translation = createTranslations({ messages, initLang: 'ru', initLangFromAcceptLanguage: true, cookieName: 'lang' });
