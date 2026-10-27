import { createTranslations } from './Translations.svelte.js';
import { bindTranslationLifecycle, getTranslationLifecycle, type translationManager, type TranslationManagerHandle } from './Internal.js';
import type { MessageLoader, Path, TranslationVariables } from './Types.js';

export type TranslationManagerOptions<
	TMessages extends Record<string, MessageLoader>,
	TInitLocale extends Extract<keyof TMessages, string>
> = Parameters<typeof createTranslations<TMessages, TInitLocale>>[0];

/** A module-safe facade. Only the provider owns request-local reactive state. */
export class TranslationManager<
	const TMessages extends Record<string, MessageLoader>,
	const TInitLocale extends Extract<keyof TMessages, string>
> implements TranslationManagerHandle {
	declare readonly [translationManager]: true;
	readonly #factory: ReturnType<typeof createTranslations<TMessages, TInitLocale>>;

	constructor(options: TranslationManagerOptions<TMessages, TInitLocale>) {
		this.#factory = createTranslations(options);
		// Resolve on every lifecycle invocation, never capture a server request here.
		bindTranslationLifecycle(this, {
			preloadTranslation: () => getTranslationLifecycle(this.#factory()).preloadTranslation(),
			initializeClient: () => getTranslationLifecycle(this.#factory()).initializeClient(),
			syncFromState: (state) => getTranslationLifecycle(this.#factory()).syncFromState(state),
			transformHtml: (html) => getTranslationLifecycle(this.#factory()).transformHtml(html)
		});
	}

	readonly t = (
		translation?:
			| Path<Awaited<ReturnType<TMessages[TInitLocale]>>>
			| string
			| { key: Path<Awaited<ReturnType<TMessages[TInitLocale]>>> | string; vars?: TranslationVariables },
		vars?: TranslationVariables
	): string => this.#factory().t(translation, vars);
	readonly switchLocale = (locale: Extract<keyof TMessages, string>): Promise<void> => this.#factory().switchLocale(locale);
	readonly applyHtmlLocaleAttr = (html: string): string => this.#factory().applyHtmlLocaleAttr(html);
	readonly subscribeLocaleChangeEvent = (listener: (locale: Extract<keyof TMessages, string>) => void): (() => void) =>
		this.#factory().subscribeLocaleChangeEvent(listener);

	get locale() {
		return this.#factory().locale;
	}

	get locales() {
		return this.#factory().locales;
	}
}
