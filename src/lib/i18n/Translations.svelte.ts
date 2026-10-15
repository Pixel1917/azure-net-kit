import { bindTranslationLifecycle, type TranslationManagerFactory } from './Internal.js';
import { RegisterProvider } from '../delivery/presenter/RegisterProvider.js';
import { Cookies, TextUtil, BROWSER } from '../external/tools/index.js';
import { RequestContext } from '../shared/request-context/Internal.js';

import type { Translation, Path, TranslationCookieOptions, MessageLoader, TranslationVariables } from './Types.js';

const PLURAL_PATTERN = /{{\s*(\w+)\s*\|\s*plural\s*:(.*?)}}/g;
const VARIABLE_PATTERN = /{{\s*(\w+)\s*}}/g;

const normalizeLocale = (locale: string): string => locale.trim().replaceAll('_', '-').toLowerCase();

const parseAcceptLanguage = (value: string | null): string[] => {
	if (!value) return [];

	return value
		.split(',')
		.map((part, index) => {
			const [locale = '', ...parameters] = part.trim().split(';');
			const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
			const quality = qualityParameter ? Number(qualityParameter.split('=')[1]) : 1;
			return { locale: locale.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
		})
		.filter(({ locale, quality }) => locale.length > 0 && quality > 0)
		.sort((left, right) => right.quality - left.quality || left.index - right.index)
		.map(({ locale }) => locale);
};

export const createTranslations = <
	const TMessages extends Record<string, MessageLoader>,
	const TInitLocale extends Extract<keyof TMessages, string>
>(params: {
	messages: TMessages;
	initLang: TInitLocale;
	cookieName?: string;
	cookieOptions?: TranslationCookieOptions;
	initLangFromAcceptLanguage?: boolean;
	prefix?: string;
}) => {
	type AvailableLocale = Extract<keyof TMessages, string>;
	type MessageKey = Path<Awaited<ReturnType<TMessages[TInitLocale]>>>;
	type TranslationExtended = { key: MessageKey | string; vars?: TranslationVariables };

	const snapshotKey = params.prefix ?? 'default';
	const availableLocales = Object.keys(params.messages) as AvailableLocale[];
	const locales = Object.freeze(Object.fromEntries(availableLocales.map((locale) => [locale, locale])) as Record<AvailableLocale, AvailableLocale>);
	if (!Object.hasOwn(params.messages, params.initLang)) throw new Error('[AzureNetKit:i18n] initLang must exist in messages.');
	const normalizedLocales = new Map<string, AvailableLocale>();
	const localeVariants = new Map<string, AvailableLocale>();

	for (const locale of availableLocales) {
		const normalized = normalizeLocale(locale);
		const base = normalized.split('-')[0];
		normalizedLocales.set(normalized, locale);
		if (base && !localeVariants.has(base)) localeVariants.set(base, locale);
	}

	const resolveLocale = (locale?: string): AvailableLocale | undefined => {
		if (!locale) return undefined;
		const normalized = normalizeLocale(locale);
		if (!normalized) return undefined;

		const exact = normalizedLocales.get(normalized);
		if (exact) return exact;

		const base = normalized.split('-')[0];
		return base ? (normalizedLocales.get(base) ?? localeVariants.get(base)) : undefined;
	};

	const factory = RegisterProvider(() => {
		const translations = new Map<AvailableLocale, Translation>();
		const pendingLoads = new Map<AvailableLocale, Promise<Translation>>();
		const localeListeners = new Set<(locale: AvailableLocale) => void>();
		let locale = $state.raw<AvailableLocale>(params.initLang);
		let activeMessages = $state.raw<Translation>({});
		let synchronized = false;
		let initializationPromise: Promise<void> | undefined;
		let switchRevision = 0;

		const loadTranslation = (requestedLocale: string): Promise<Translation> => {
			const resolvedLocale = resolveLocale(requestedLocale);
			if (!resolvedLocale) {
				return Promise.reject(new Error(`[AzureNetKit:i18n] Locale "${requestedLocale}" is not present in messages.`));
			}

			const cached = translations.get(resolvedLocale);
			if (cached) return Promise.resolve(cached);

			const pending = pendingLoads.get(resolvedLocale);
			if (pending) return pending;

			const request = Promise.resolve()
				.then(() => params.messages[resolvedLocale]())
				.then((loaded) => {
					// Imported dictionaries are module-cached; request state must not expose that shared object.
					const messages = BROWSER ? loaded : structuredClone(loaded);
					translations.set(resolvedLocale, messages);
					return messages;
				})
				.finally(() => {
					if (pendingLoads.get(resolvedLocale) === request) pendingLoads.delete(resolvedLocale);
				});

			pendingLoads.set(resolvedLocale, request);
			return request;
		};

		const getLocaleFromRequest = () => {
			const event = RequestContext.current().event;
			if (!event) throw new Error('[AzureNetKit:i18n] RequestContext has no RequestEvent.');

			const cookieLocale = params.cookieName ? resolveLocale(event.cookies.get(params.cookieName)) : undefined;
			if (cookieLocale) return cookieLocale;

			if (params.initLangFromAcceptLanguage) {
				for (const requestedLocale of parseAcceptLanguage(event.request.headers.get('accept-language'))) {
					if (requestedLocale === '*') return params.initLang;
					const resolvedLocale = resolveLocale(requestedLocale);
					if (resolvedLocale) return resolvedLocale;
				}
			}

			return params.initLang;
		};

		const preloadTranslation = async (resolver?: () => string | Promise<string>) => {
			if (BROWSER) throw new Error('[AzureNetKit:i18n] preloadTranslation() is server-only.');

			const revision = ++switchRevision;
			const requestedLocale = resolver ? await resolver() : getLocaleFromRequest();
			const resolvedLocale = resolveLocale(requestedLocale) ?? params.initLang;
			const messages = await loadTranslation(resolvedLocale);
			if (revision !== switchRevision) return;
			locale = resolvedLocale;
			activeMessages = messages;
			const state = RequestContext.current().state;
			state.currLocale = resolvedLocale;
			const snapshots = (state.i18n ??= {});
			Object.defineProperty(snapshots, snapshotKey, { value: { locale }, enumerable: true, configurable: true, writable: true });
		};

		const getTranslation = (messageKey: string): string | undefined => {
			let current: Translation | undefined = activeMessages;

			for (const key of messageKey.split('.')) {
				if (typeof current === 'string' || !current || !Object.hasOwn(current, key)) return undefined;
				current = current[key];
			}

			return typeof current === 'string' ? current : undefined;
		};

		const translate = (messageKey: string, vars: TranslationVariables = {}): string => {
			let result = getTranslation(messageKey);
			if (result === undefined) return messageKey;
			if (!result.includes('{{')) return result;

			result = result.replace(PLURAL_PATTERN, (_, variableName: string, titlesString: string) => {
				const count = Number(vars[variableName]);
				if (Number.isNaN(count)) {
					console.warn(`[AzureNetKit:i18n] Plural variable "${variableName}" is not numeric.`);
					return '';
				}

				return TextUtil.pluralize(
					count,
					titlesString.split(',').map((title) => title.trim())
				);
			});

			return result.replace(VARIABLE_PATTERN, (_, key: string) => (vars[key] === undefined ? '' : String(vars[key])));
		};

		const t = (translation?: MessageKey | TranslationExtended | string, vars?: TranslationVariables): string => {
			if (!translation) return '';
			const extended = typeof translation === 'object' ? translation : undefined;
			return translate(String(extended?.key ?? translation), extended?.vars ?? vars);
		};

		const syncFromState = (state: App.RequestContextState): void => {
			if (synchronized) return;
			const snapshot = state.i18n && Object.hasOwn(state.i18n, snapshotKey) ? state.i18n[snapshotKey] : undefined;
			const nextLocale = resolveLocale(snapshot?.locale ?? state.currLocale);
			if (snapshot && !nextLocale) throw new Error('[AzureNetKit:i18n] Unsupported boot locale.');
			synchronized = true;
			++switchRevision;
			initializationPromise = undefined;
			if (nextLocale) locale = nextLocale;
			activeMessages = translations.get(locale) ?? {};
		};

		const updateHtmlLocale = (currentLocale: AvailableLocale) => {
			document.documentElement.lang = currentLocale;
		};

		const initializeClient = (): Promise<void> => {
			if (!BROWSER) return Promise.resolve();
			if (initializationPromise) return initializationPromise;

			// SSR marker is available before SvelteKit starts hydration; boot runs later.
			const serverLocale = document.documentElement.getAttribute('data-azure-net-locale');
			locale =
				resolveLocale(serverLocale ?? undefined) ??
				resolveLocale((params.cookieName ? Cookies.get(params.cookieName) : undefined) ?? undefined) ??
				(params.initLangFromAcceptLanguage ? navigator.languages.map(resolveLocale).find(Boolean) : undefined) ??
				locale;
			const revision = switchRevision;
			const request = loadTranslation(locale)
				.then((messages) => {
					if (revision !== switchRevision) {
						if (initializationPromise === request) initializationPromise = undefined;
						return;
					}
					activeMessages = messages;
					updateHtmlLocale(locale);
				})
				.catch((error: unknown) => {
					if (initializationPromise === request) initializationPromise = undefined;
					throw error;
				});

			initializationPromise = request;
			return request;
		};

		const switchLocale = async (requestedLocale: AvailableLocale) => {
			if (!BROWSER) throw new Error('[AzureNetKit:i18n] switchLocale() is client-only.');

			const resolvedLocale = resolveLocale(requestedLocale);
			if (!resolvedLocale) throw new Error(`[AzureNetKit:i18n] Locale "${requestedLocale}" is not present in messages.`);

			const revision = ++switchRevision;
			const messages = await loadTranslation(resolvedLocale);
			if (revision !== switchRevision) return;

			locale = resolvedLocale;
			activeMessages = messages;
			if (params.cookieName) {
				Cookies.set(params.cookieName, resolvedLocale, {
					path: '/',
					sameSite: 'Lax',
					...params.cookieOptions
				});
			}
			updateHtmlLocale(resolvedLocale);
			for (const listener of localeListeners) listener(resolvedLocale);
		};

		const subscribeLocaleChangeEvent = (listener: (locale: AvailableLocale) => void): (() => void) => {
			if (!BROWSER) throw new Error('[AzureNetKit:i18n] Locale change events are client-only.');
			localeListeners.add(listener);
			return () => localeListeners.delete(listener);
		};

		const applyHtmlLocaleAttr = (html: string) => html.replaceAll('%lang%', () => locale);

		const manager = {
			switchLocale,
			applyHtmlLocaleAttr,
			subscribeLocaleChangeEvent,
			t,
			get locale() {
				return locale;
			},
			locales
		};
		const escapeAttribute = (value: string) =>
			value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
		bindTranslationLifecycle(manager, {
			preloadTranslation,
			initializeClient,
			syncFromState,
			transformHtml: (html) =>
				applyHtmlLocaleAttr(html).replace(
					/<html\b([^>]*)>/i,
					(_, attrs: string) =>
						'<html' +
						attrs.replace(/\s+(?:data-azure-net-locale|lang)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '') +
						' lang="' +
						escapeAttribute(locale) +
						'" data-azure-net-locale="' +
						escapeAttribute(locale) +
						'">'
				)
		});
		return manager;
	}, 'singleton');
	return factory as typeof factory & TranslationManagerFactory;
};
