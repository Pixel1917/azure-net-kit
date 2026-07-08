import { goto } from '$app/navigation';
import { redirect } from '@sveltejs/kit';
import { BROWSER } from '@azure-net/tools/environment';

export type RedirectStatus = 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308;

export interface IRedirectSettings {
	clientRedirectSettings?: {
		replaceState?: boolean | undefined;
		noScroll?: boolean | undefined;
		keepFocus?: boolean | undefined;
		invalidateAll?: boolean | undefined;
		invalidate?: (string | URL | ((url: URL) => boolean))[] | undefined;
		state?: App.PageState | undefined;
	};
	serverRedirectSettings?: {
		status?: RedirectStatus;
	};
	type?: 'server' | 'client' | 'universal';
}

export const useRedirect = (path: string, settings?: IRedirectSettings) => {
	const { type = 'universal', serverRedirectSettings = { status: 301 }, clientRedirectSettings } = settings ?? {};
	const clientRedirect = () => goto(path, clientRedirectSettings);
	const serverRedirected = () => redirect(serverRedirectSettings.status ?? 301, path);

	switch (type) {
		case 'server':
			return serverRedirected();
		case 'client':
			return clientRedirect();
		case 'universal':
			return BROWSER ? clientRedirect() : serverRedirected();
		default:
			return BROWSER ? clientRedirect() : serverRedirected();
	}
};
