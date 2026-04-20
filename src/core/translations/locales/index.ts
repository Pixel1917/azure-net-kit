export const messages = {
	en: () => import('./en/index.js').then((res) => res.default),
	ru: () => import('./ru/index.js').then((res) => res.default)
};
