export function watchTranslations(manager: { readonly locale: string; t: (key: string) => string }, observe: (value: string) => void) {
	return $effect.root(() => {
		$effect(() => observe(manager.locale + ':' + manager.t('title')));
	});
}
