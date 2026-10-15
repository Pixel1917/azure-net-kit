export interface TranslationLifecycle {
	preloadTranslation(): Promise<void>;
	initializeClient(): Promise<void>;
	syncFromState(state: App.RequestContextState): void;
	transformHtml(html: string): string;
}
declare const translationManager: unique symbol;
export type TranslationManagerFactory = (() => object) & { readonly [translationManager]: true };
const lifecycles = new WeakMap<object, TranslationLifecycle>();
export const bindTranslationLifecycle = (manager: object, lifecycle: TranslationLifecycle): void => {
	lifecycles.set(manager, lifecycle);
};
export const getTranslationLifecycle = (manager: object): TranslationLifecycle => {
	const lifecycle = lifecycles.get(manager);
	if (!lifecycle) throw new Error('[AzureNetKit:i18n] Expected a manager returned by createTranslations().');
	return lifecycle;
};
