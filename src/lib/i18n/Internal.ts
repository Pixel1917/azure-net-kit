export interface TranslationLifecycle {
	preloadTranslation(): Promise<void>;
	initializeClient(): Promise<void>;
	syncFromState(state: App.RequestContextState): void;
	transformHtml(html: string): string;
}
export declare const translationManager: unique symbol;
export interface TranslationManagerHandle {
	readonly [translationManager]: true;
}
export type TranslationManagerFactory = (() => object) & TranslationManagerHandle;
export type TranslationManagerSource = TranslationManagerFactory | TranslationManagerHandle;
const lifecycles = new WeakMap<object, TranslationLifecycle>();
export const bindTranslationLifecycle = (manager: object, lifecycle: TranslationLifecycle): void => {
	lifecycles.set(manager, lifecycle);
};
export const getTranslationLifecycle = (manager: object): TranslationLifecycle => {
	const lifecycle = lifecycles.get(manager);
	if (!lifecycle) throw new Error('[AzureNetKit:i18n] Expected a TranslationManager or a manager returned by createTranslations().');
	return lifecycle;
};
export const getTranslationManagerLifecycle = (manager: TranslationManagerSource): TranslationLifecycle =>
	getTranslationLifecycle(typeof manager === 'function' ? manager() : manager);
