import { getTranslationManagerLifecycle, type TranslationManagerSource } from '../../i18n/Internal.js';
import { hydratable } from 'svelte';
import { getContextInternals } from '../../shared/request-context/Internal.js';
import { BROWSER } from '../../external/tools/index.js';
import { RequestContext, type ContextData } from '../../shared/request-context/Internal.js';
import { AppError, AzureNetKitInternalError, type IAppError } from '../app-error/AppError.js';
import { bindAzureNetKitErrorResolver, type AsyncHelperRetry, type AzureNetKitErrorResolver } from '../app-error/ErrorRuntime.js';
import { executeServerMiddlewares, type ServerMiddlewareClass } from './middleware/ServerMiddleware.js';
import type { Handle, HandleFetch, HandleServerError, HandleClientError, Reroute, ServerInit, Transport } from '@sveltejs/kit/hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { beforeNavigate } from '$app/navigation';
import { executeClientMiddlewares, type ClientMiddlewareClass } from './middleware/ClientMiddleware.js';
import { useLogger } from '../logger/index.js';

type MaybePromise<T> = T | Promise<T>;
type HandleInput = Parameters<Handle>[0];
type Resolve = HandleInput['resolve'];
type BuilderFlags = Partial<
	Record<
		| 'useTranslations'
		| 'useBoot'
		| 'use'
		| 'useClient'
		| 'useClientInit'
		| 'useClientError'
		| 'useServerInit'
		| 'useServer'
		| 'useServerError'
		| 'useServerFetch'
		| 'useAzureNetKitError'
		| 'useReroute'
		| 'useTransport',
		true
	>
>;
type WithFlag<TFlags extends BuilderFlags, TKey extends keyof BuilderFlags> = TFlags & Record<TKey, true>;

type OnceMethod<TFlags extends BuilderFlags, TKey extends keyof BuilderFlags, TMethod> = TFlags[TKey] extends true ? object : TMethod;

export interface AppUniversalLifecycleContext {
	isClient: boolean;
	isServer: boolean;
	requestContext?: ContextData;
	event?: RequestEvent;
}

export interface AppClientLifecycleContext {
	useMiddlewares: (middlewares: readonly ClientMiddlewareClass[]) => void;
}

export type AppClientInitLifecycleContext = void;

export type AppClientErrorContext = Parameters<HandleClientError>[0];

export type AppServerInitLifecycleContext = void;

export interface AppServerLifecycleContext {
	requestContext: ContextData;
	event: RequestEvent;
	resolve: Resolve;
	useMiddlewares: (middlewares: readonly ServerMiddlewareClass[]) => Promise<void>;
}

export type AppServerErrorContext = Parameters<HandleServerError>[0] & {
	requestContext: ContextData;
	useLogger: typeof useLogger;
};

export type AppServerFetchContext = Parameters<HandleFetch>[0] & {
	requestContext: ContextData;
};

export interface AppAzureNetKitErrorContext {
	error: AppError;
	retry: AsyncHelperRetry;
	isClient: boolean;
	isServer: boolean;
	requestContext?: ContextData;
	event?: RequestEvent;
}

export type AppUniversalLifecycleCallback = (context: AppUniversalLifecycleContext) => MaybePromise<void>;
export type AppClientLifecycleCallback = (context: AppClientLifecycleContext) => MaybePromise<void>;
export type AppClientInitLifecycleCallback = (context: AppClientInitLifecycleContext) => MaybePromise<void>;
export type AppClientErrorCallback = (context: AppClientErrorContext) => ReturnType<HandleClientError>;
export type AppServerInitLifecycleCallback = ServerInit;
export type AppServerLifecycleCallback = (context: AppServerLifecycleContext) => MaybePromise<Response | void>;
export type AppServerErrorCallback = (context: AppServerErrorContext) => ReturnType<HandleServerError>;
export type AppServerFetchCallback = (context: AppServerFetchContext) => ReturnType<HandleFetch>;
export type AppAzureNetKitErrorCallback = (context: AppAzureNetKitErrorContext) => MaybePromise<IAppError & object>;
export type AppRerouteCallback = Reroute;

export interface AppBootContext {
	state: App.RequestContextState;
}
export type AppBootCallback = (context: AppBootContext) => undefined;

export type CreateAppBuilder<TFlags extends BuilderFlags = object> = OnceMethod<
	TFlags,
	'useBoot',
	{
		useBoot(callback: AppBootCallback): CreateAppBuilder<WithFlag<TFlags, 'useBoot'>>;
	}
> &
	OnceMethod<
		TFlags,
		'useTranslations',
		{ useTranslations(manager: TranslationManagerSource): CreateAppBuilder<WithFlag<TFlags, 'useTranslations'>> }
	> &
	OnceMethod<TFlags, 'use', { use(callback: AppUniversalLifecycleCallback): CreateAppBuilder<WithFlag<TFlags, 'use'>> }> &
	OnceMethod<TFlags, 'useClient', { useClient(callback: AppClientLifecycleCallback): CreateAppBuilder<WithFlag<TFlags, 'useClient'>> }> &
	OnceMethod<
		TFlags,
		'useClientInit',
		{
			useClientInit(callback: AppClientInitLifecycleCallback): CreateAppBuilder<WithFlag<TFlags, 'useClientInit'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useClientError',
		{
			useClientError(callback: AppClientErrorCallback): CreateAppBuilder<WithFlag<TFlags, 'useClientError'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useServerInit',
		{
			useServerInit(callback: AppServerInitLifecycleCallback): CreateAppBuilder<WithFlag<TFlags, 'useServerInit'>>;
		}
	> &
	OnceMethod<TFlags, 'useServer', { useServer(callback: AppServerLifecycleCallback): CreateAppBuilder<WithFlag<TFlags, 'useServer'>> }> &
	OnceMethod<
		TFlags,
		'useServerError',
		{
			useServerError(callback: AppServerErrorCallback): CreateAppBuilder<WithFlag<TFlags, 'useServerError'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useServerFetch',
		{
			useServerFetch(callback: AppServerFetchCallback): CreateAppBuilder<WithFlag<TFlags, 'useServerFetch'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useAzureNetKitError',
		{
			useAzureNetKitError(callback: AppAzureNetKitErrorCallback): CreateAppBuilder<WithFlag<TFlags, 'useAzureNetKitError'>>;
		}
	> &
	OnceMethod<TFlags, 'useReroute', { useReroute(callback: AppRerouteCallback): CreateAppBuilder<WithFlag<TFlags, 'useReroute'>> }> &
	OnceMethod<TFlags, 'useTransport', { useTransport(transport: Transport): CreateAppBuilder<WithFlag<TFlags, 'useTransport'>> }>;

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
	use?: AppUniversalLifecycleCallback;
	useClient?: AppClientLifecycleCallback;
	useClientInit?: AppClientInitLifecycleCallback;
	useClientError?: AppClientErrorCallback;
	useServerInit?: AppServerInitLifecycleCallback;
	useServer?: AppServerLifecycleCallback;
	useServerError?: AppServerErrorCallback;
	useServerFetch?: AppServerFetchCallback;
	useAzureNetKitError?: AppAzureNetKitErrorCallback;
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

const setCallback = <TKey extends keyof AppCallbacks>(callbacks: AppCallbacks, key: TKey, callback: NonNullable<AppCallbacks[TKey]>) => {
	if (callbacks[key]) {
		throw new AzureNetKitInternalError(`[createApp] '${key}' can be registered only once.`);
	}
	callbacks[key] = callback;
};

const createBuilder = (callbacks: AppCallbacks): CreateAppBuilder => {
	const builder = {
		useTranslations(manager: TranslationManagerSource) {
			setCallback(callbacks, 'useTranslations', manager);
			return builder;
		},
		useBoot(callback: AppBootCallback) {
			setCallback(callbacks, 'useBoot', callback);
			return builder;
		},
		use(callback: AppUniversalLifecycleCallback) {
			setCallback(callbacks, 'use', callback);
			return builder;
		},

		useClient(callback: AppClientLifecycleCallback) {
			setCallback(callbacks, 'useClient', callback);
			return builder;
		},

		useClientInit(callback: AppClientInitLifecycleCallback) {
			setCallback(callbacks, 'useClientInit', callback);
			return builder;
		},

		useClientError(callback: AppClientErrorCallback) {
			setCallback(callbacks, 'useClientError', callback);
			return builder;
		},

		useServerInit(callback: AppServerInitLifecycleCallback) {
			setCallback(callbacks, 'useServerInit', callback);
			return builder;
		},

		useServer(callback: AppServerLifecycleCallback) {
			setCallback(callbacks, 'useServer', callback);
			return builder;
		},

		useServerError(callback: AppServerErrorCallback) {
			setCallback(callbacks, 'useServerError', callback);
			return builder;
		},

		useServerFetch(callback: AppServerFetchCallback) {
			setCallback(callbacks, 'useServerFetch', callback);
			return builder;
		},

		useAzureNetKitError(callback: AppAzureNetKitErrorCallback) {
			setCallback(callbacks, 'useAzureNetKitError', callback);
			return builder;
		},

		useReroute(callback: AppRerouteCallback) {
			setCallback(callbacks, 'useReroute', callback);
			return builder;
		},

		useTransport(transport: Transport) {
			setCallback(callbacks, 'useTransport', transport);
			return builder;
		}
	};

	return builder as unknown as CreateAppBuilder;
};

export const createApp = (callback: (app: CreateAppBuilder) => unknown): CreateAppInstance => {
	const appKey = {};
	const callbacks: AppCallbacks = {};
	let clientInitialized = false;
	let translationInitPromise: Promise<void> | undefined;
	let serverInitPromise: Promise<void> | undefined;

	callback(createBuilder(callbacks));

	const errorResolver: AzureNetKitErrorResolver | undefined = callbacks.useAzureNetKitError
		? (error, retry) => {
				const requestContext = BROWSER ? undefined : getRequestContext();
				return callbacks.useAzureNetKitError!({
					error,
					retry,
					isClient: BROWSER,
					isServer: !BROWSER,
					requestContext,
					event: requestContext?.event
				});
			}
		: undefined;

	const bindErrorResolver = (requestContext?: ContextData) => {
		bindAzureNetKitErrorResolver(errorResolver, requestContext);
	};

	const runClient = (kind: Extract<LifecycleKind, 'client' | 'clientInit'>) => {
		if (!BROWSER) return undefined;
		bindErrorResolver();

		const flags = getLifecycleFlags(appKey);
		if (flags[kind]) return kind === 'clientInit' ? translationInitPromise : undefined;
		flags[kind] = true;

		if (kind === 'clientInit') {
			const initialize = () => {
				const universalContext: AppUniversalLifecycleContext = {
					isClient: true,
					isServer: false
				};
				const universalResult = callbacks.use?.(universalContext);
				if (universalResult && typeof (universalResult as Promise<void>).then === 'function') {
					return (universalResult as Promise<void>).then(() => callbacks.useClientInit?.());
				}

				return callbacks.useClientInit?.();
			};
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
		let internalMiddlewares: readonly ClientMiddlewareClass[] = [];
		if (!clientInitialized) {
			beforeNavigate((navigation) => {
				executeClientMiddlewares(internalMiddlewares, navigation);
			});
			clientInitialized = true;
		}
		return callbacks.useClient?.({
			useMiddlewares: (middlewares: readonly ClientMiddlewareClass[]) => {
				internalMiddlewares = middlewares;
			}
		});
	};

	const runServerInit: ServerInit = () => {
		if (BROWSER) return undefined;
		serverInitPromise ??= Promise.resolve().then(() => callbacks.useServerInit?.());
		return serverInitPromise;
	};

	const runServerError: HandleServerError = (input) => {
		if (BROWSER) return undefined;
		const requestContext = getServerRequestContext();
		bindErrorResolver(requestContext);

		try {
			const result = callbacks.useServerError?.({
				requestContext,
				...input,
				useLogger
			});

			if (result && typeof (result as Promise<unknown>).then === 'function') {
				return Promise.resolve(result).finally(() => bindAzureNetKitErrorResolver(undefined, requestContext));
			}

			bindAzureNetKitErrorResolver(undefined, requestContext);
			return result;
		} catch (error) {
			bindAzureNetKitErrorResolver(undefined, requestContext);
			throw error;
		}
	};

	const runClientError: HandleClientError = (input) => {
		if (!BROWSER) return undefined;
		bindErrorResolver();

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
		bindErrorResolver(requestContext);

		try {
			const flags = getLifecycleFlags(appKey, requestContext);

			if (!flags.server) {
				flags.server = true;
				if (translations) await translations.preloadTranslation();

				const universalResult = callbacks.use?.({
					isClient: false,
					isServer: true,
					requestContext,
					event
				});

				if (universalResult && typeof (universalResult as Promise<void>).then === 'function') {
					await universalResult;
				}

				const serverResult = await callbacks.useServer?.({
					requestContext,
					event,
					resolve,
					useMiddlewares: executeServerMiddlewares
				});

				if (serverResult) return serverResult;
			}

			return await resolve(event);
		} finally {
			bindAzureNetKitErrorResolver(undefined, requestContext);
		}
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
