export type EnsureRouteSource = string | readonly string[];
export type EnsureRouteTarget = string | URL;
export type EnsureRoute = (route: EnsureRouteSource, target: EnsureRouteTarget) => boolean;

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, '');

const normalizePathname = (value: EnsureRouteTarget): string => {
	const pathname = value instanceof URL ? value.pathname : value;
	const normalized = `/${trimSlashes(pathname.split('?')[0] ?? '/')}`;
	return normalized === '//' ? '/' : normalized;
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const routeToRegex = (route: string): RegExp => {
	const normalizedRoute = normalizePathname(route);
	if (normalizedRoute === '/') return /^\/$/;

	const segments = trimSlashes(normalizedRoute).split('/');
	const pattern = segments
		.map((segment) => {
			if (/^\{[^/{}]+\}$/.test(segment)) {
				return '[^/]+';
			}

			return escapeRegex(segment).replace(/\\\{[^/{}]+\\\}/g, '[^/]+');
		})
		.join('\\/');

	return new RegExp(`^\\/${pattern}$`);
};

export const ensureRoute: EnsureRoute = (route, target) => {
	const pathname = normalizePathname(target);
	const routes = Array.isArray(route) ? route : [route];

	for (const item of routes) {
		if (routeToRegex(item).test(pathname)) return true;
	}

	return false;
};
