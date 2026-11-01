import { getTranslationManagerLifecycle, type TranslationManagerSource } from '../../i18n/Internal.js';
import { hydratable } from 'svelte';
import { getContextInternals } from '../../shared/request-context/Internal.js';
import { BROWSER } from '../../external/tools/index.js';
import { RequestContext, type ContextData } from '../../shared/request-context/Internal.js';
import { AzureNetKitInternalError } from '../app-error/AppError.js';
import type { Handle, HandleFetch, HandleServerError, HandleClientError, Reroute, ServerInit, Transport } from '@sveltejs/kit/hooks';
import type { RequestEvent } from '@sveltejs/kit';

type MaybePromise<T> = T | Promise<T>;
type HandleInput = Parameters<Handle>[0];
type Resolve = HandleInput['resolve'];
export type AppClientLifecycleContext = void;

export type AppClientInitLifecycleContext = void;

export type AppClientErrorContext = Parameters<HandleClientError>[0];

export type AppServerInitLifecycleContext = void;

export interface AppServerLifecycleContext {
	requestContext: ContextData;
	event: RequestEvent;
	resolve: Resolve;
}

export type AppServerErrorContext = Parameters<HandleServerError>[0] & {
	requestContext: ContextData;
};

export type AppServerFetchContext = Parameters<HandleFetch>[0] & {
	requestContext: ContextData;
};

export type AppClientLifecycleCallback = (context: AppClientLifecycleContext) => MaybePromise<void>;
export type AppClientInitLifecycleCallback = (context: AppClientInitLifecycleContext) => MaybePromise<void>;
export type AppClientErrorCallback = (context: AppClientErrorContext) => ReturnType<HandleClientError>;
export type AppServerInitLifecycleCallback = ServerInit;
export type AppServerLifecycleCallback = (context: AppServerLifecycleContext) => MaybePromise<Response | void>;
export type AppServerErrorCallback = (context: AppServerErrorContext) => ReturnType<HandleServerError>;
export type AppServerFetchCallback = (context: AppServerFetchContext) => ReturnType<HandleFetch>;
export type AppRerouteCallback = Reroute;

export interface AppBootContext {
	state: App.RequestContextState;
}
export type AppBootCallback = (context: AppBootContext) => undefined;

export interface AppConfiguration {
	useTranslations(manager: TranslationManagerSource): void;
	useBoot(callback: AppBootCallback): void;
	useClient(callback: AppClientLifecycleCallback): void;
	useClientInit(callback: AppClientInitLifecycleCallback): void;
	useClientError(callback: AppClientErrorCallback): void;
	useServerInit(callback: AppServerInitLifecycleCallback): void;
	useServer(callback: AppServerLifecycleCallback): void;
	useServerError(callback: AppServerErrorCallback): void;
	useServerFetch(callback: AppServerFetchCallback): void;
	useReroute(callback: AppRerouteCallback): void;
	useTransport(transport: Transport): void;
}

export interface AppRegistrar {
	(): MaybePromise<void>;
	clientInit(): MaybePromise<void>;
	clientError: HandleClientError;
	serverInit: ServerInit;
	serverError: HandleServerError;
	serverFetch: HandleFetch;
	handle: Handle;
	reroute: Reroute;
	transport: Transport;
}

export interface CreateAppInstance {
	register: AppRegistrar;
}

type LifecycleKind = 'boot' | 'client' | 'clientInit' | 'serverInit' | 'server';
type LifecycleFlags = Partial<Record<LifecycleKind, true>>;

interface AppCallbacks {
	useTranslations?: TranslationManagerSource;
	useBoot?: AppBootCallback;
	useClient?: AppClientLifecycleCallback;
	useClientInit?: AppClientInitLifecycleCallback;
	useClientError?: AppClientErrorCallback;
	useServerInit?: AppServerInitLifecycleCallback;
	useServer?: AppServerLifecycleCallback;
	useServerError?: AppServerErrorCallback;
	useServerFetch?: AppServerFetchCallback;
	useReroute?: AppRerouteCallback;
	useTransport?: Transport;
}

const clientLifecycleFlags = new WeakMap<object, LifecycleFlags>();

const getRequestContext = (): ContextData | undefined => {
	try {
		return RequestContext.current();
	} catch {
		return undefined;
	}
};

const getServerRequestContext = (): ContextData => {
	const requestContext = getRequestContext();
	if (requestContext) return requestContext;

	throw new AzureNetKitInternalError('[createApp] RequestContext is not initialized on server.');
};

const getLifecycleFlags = (appKey: object, requestContext?: ContextData): LifecycleFlags => {
	if (BROWSER) {
		let flags = clientLifecycleFlags.get(appKey);
		if (!flags) {
			flags = {};
			clientLifecycleFlags.set(appKey, flags);
		}
		return flags;
	}

	const context = requestContext ?? getRequestContext();
	if (!context) {
		throw new AzureNetKitInternalError('[createApp] RequestContext is not initialized on server.');
	}

	const flagsMap = (getContextInternals(context).appLifecycleFlags ??= new WeakMap<object, LifecycleFlags>()) as WeakMap<object, LifecycleFlags>;

	let flags = flagsMap.get(appKey);
	if (!flags) {
		flags = {};
		flagsMap.set(appKey, flags);
	}

	return flags;
};

const configureApp = (callbacks: AppCallbacks, configure: (app: AppConfiguration) => void): void => {
	let open = true;
	const set = <TKey extends keyof AppCallbacks>(key: TKey, value: NonNullable<AppCallbacks[TKey]>): void => {
		if (!open) throw new AzureNetKitInternalError('[createApp] Configuration is closed. Register hooks synchronously inside createApp.');
		if (Object.hasOwn(callbacks, key)) throw new AzureNetKitInternalError(`[createApp] '${key}' can be registered only once.`);
		callbacks[key] = value;
	};
	const app: AppConfiguration = {
		useTranslations: (value) => set('useTranslations', value),
		useBoot: (value) => set('useBoot', value),
		useClient: (value) => set('useClient', value),
		useClientInit: (value) => set('useClientInit', value),
		useClientError: (value) => set('useClientError', value),
		useServerInit: (value) => set('useServerInit', value),
		useServer: (value) => set('useServer', value),
		useServerError: (value) => set('useServerError', value),
		useServerFetch: (value) => set('useServerFetch', value),
		useReroute: (value) => set('useReroute', value),
		useTransport: (value) => set('useTransport', value)
	};
	try {
		const result = configure(app) as unknown;
		if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
			void Promise.resolve(result).catch(() => undefined);
			throw new AzureNetKitInternalError('[createApp] Configuration must be synchronous.');
		}
	} finally {
		open = false;
	}
};

export const createApp = (callback: (app: AppConfiguration) => void): CreateAppInstance => {
	const appKey = {};
	const callbacks: AppCallbacks = {};
	let translationInitPromise: Promise<void> | undefined;
	let serverInitPromise: Promise<void> | undefined;

	configureApp(callbacks, callback);

	const runClient = (kind: Extract<LifecycleKind, 'client' | 'clientInit'>) => {
		if (!BROWSER) return undefined;

		const flags = getLifecycleFlags(appKey);
		if (flags[kind]) return kind === 'clientInit' ? translationInitPromise : undefined;
		flags[kind] = true;

		if (kind === 'clientInit') {
			const initialize = () => callbacks.useClientInit?.();
			if (!callbacks.useTranslations) return initialize();
			translationInitPromise = getTranslationManagerLifecycle(callbacks.useTranslations)
				.initializeClient()
				.then(initialize)
				.catch((error: unknown) => {
					delete flags.clientInit;
					translationInitPromise = undefined;
					throw error;
				});
			return translationInitPromise;
		}
		return callbacks.useClient?.();
	};

	const runServerInit: ServerInit = () => {
		if (BROWSER) return undefined;
		serverInitPromise ??= Promise.resolve().then(() => callbacks.useServerInit?.());
		return serverInitPromise;
	};

	const runServerError: HandleServerError = (input) => {
		if (BROWSER) return undefined;
		return callbacks.useServerError?.({ requestContext: getServerRequestContext(), ...input });
	};

	const runClientError: HandleClientError = (input) => {
		if (!BROWSER) return undefined;

		return callbacks.useClientError?.({
			...input
		});
	};

	const runServerFetch: HandleFetch = (input) => {
		if (!callbacks.useServerFetch) return input.fetch(input.request);

		return callbacks.useServerFetch({
			...input,

			requestContext: getServerRequestContext()
		});
	};

	const reroute: Reroute = (input) => callbacks.useReroute?.(input);

	const handle: Handle = async ({ event, resolve: originalResolve }) => {
		const translations = callbacks.useTranslations ? getTranslationManagerLifecycle(callbacks.useTranslations) : undefined;
		const resolve: Resolve = translations
			? (event, options) =>
					originalResolve(event, {
						...options,
						transformPageChunk: async (chunk) => translations.transformHtml((await options?.transformPageChunk?.(chunk)) ?? chunk.html)
					})
			: originalResolve;
		const requestContext = getServerRequestContext();

		const flags = getLifecycleFlags(appKey, requestContext);

		if (!flags.server) {
			flags.server = true;
			if (translations) await translations.preloadTranslation();

			const serverResult = await callbacks.useServer?.({
				requestContext,
				event,
				resolve
			});

			if (serverResult) return serverResult;
		}

		return await resolve(event);
	};

	const runBoot = () => {
		if (!callbacks.useBoot && !callbacks.useTranslations) return;
		const flags = getLifecycleFlags(appKey);
		if (flags.boot) return;
		flags.boot = true;
		const state = hydratable('@azure-net/kit:initial-state:v1', () => (BROWSER ? ({} as App.RequestContextState) : RequestContext.current().state));
		if (callbacks.useTranslations) getTranslationManagerLifecycle(callbacks.useTranslations).syncFromState(state);
		const result = callbacks.useBoot?.({ state }) as unknown;
		if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
			void Promise.resolve(result).catch(() => undefined);
			throw new AzureNetKitInternalError('[createApp] useBoot must be synchronous.');
		}
	};
	const register = Object.assign(
		() => {
			runBoot();
			return runClient('client');
		},
		{
			clientInit: () => runClient('clientInit'),
			clientError: runClientError,
			serverInit: runServerInit,
			serverError: runServerError,
			serverFetch: runServerFetch,
			handle,
			reroute,
			transport: callbacks.useTransport ?? {}
		}
	) as AppRegistrar;

	return {
		register
	};
};
