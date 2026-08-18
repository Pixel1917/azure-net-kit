import { BROWSER } from '../../external/tools/index.js';
import { RequestContext, type ContextData } from '../../external/edges/ServerContext.js';
import { createBoundaryProvider } from '../boundary-provider/Provider.js';
import { AppError, AzureNetKitInternalError, type IAppError } from '../app-error/AppError.js';
import { bindAzureNetKitErrorResolver, type AsyncHelperRetry, type AzureNetKitErrorResolver } from '../app-error/ErrorRuntime.js';
import { AppEvents } from '../event-bus/EventBus.js';
import { executeServerMiddlewares, type IServerMiddleware } from './middleware/ServerMiddleware.js';
import type {
	Handle,
	HandleClientError,
	HandleFetch,
	HandleServerError,
	HandleValidationError,
	RequestEvent,
	Reroute,
	ServerInit,
	Transport
} from '@sveltejs/kit';
import { beforeNavigate } from '$app/navigation';
import { executeClientMiddlewares, type IClientMiddleware } from './middleware/ClientMiddleware.js';
import { useLogger } from '../logger/index.js';

type MaybePromise<T> = T | Promise<T>;
type HandleInput = Parameters<Handle>[0];
type Resolve = HandleInput['resolve'];
type AppDependencyFactory<TApp, TReturn = unknown> = (app: TApp) => TReturn;
type AppDependencyFactories<TApp> = Record<string, AppDependencyFactory<TApp>>;
type ServiceFactories<TDependencies> = {
	[K in keyof TDependencies]: () => ResolvedDependencies<TDependencies>[K];
};
type ResolvedDependencies<T> = {
	[K in keyof T]: T[K] extends (...args: never[]) => infer TReturn ? TReturn : never;
};
type BuilderFlags = Partial<
	Record<
		| 'use'
		| 'useClient'
		| 'useClientInit'
		| 'useClientError'
		| 'useServerInit'
		| 'useServer'
		| 'useServerError'
		| 'useServerFetch'
		| 'useServerValidationError'
		| 'useAzureNetKitError'
		| 'useReroute'
		| 'useTransport',
		true
	>
>;
type WithFlag<TFlags extends BuilderFlags, TKey extends keyof BuilderFlags> = TFlags & Record<TKey, true>;
type BuilderDependencies<TBuilder> = TBuilder extends { readonly __types__?: infer TDependencies } ? TDependencies : never;

type OnceMethod<TFlags extends BuilderFlags, TKey extends keyof BuilderFlags, TMethod> = TFlags[TKey] extends true ? object : TMethod;

export type AppContainer<TDependencies extends Record<string, unknown>> = Readonly<TDependencies>;

export interface AppUniversalLifecycleContext<TDependencies extends Record<string, unknown>> {
	Container: AppContainer<TDependencies>;
	isClient: boolean;
	isServer: boolean;
	requestContext?: ContextData;
	event?: RequestEvent;
}

export interface AppClientLifecycleContext<TDependencies extends Record<string, unknown>> {
	Container: AppContainer<TDependencies>;
	useMiddlewares: (middlewares: IClientMiddleware[]) => void;
}

export interface AppClientInitLifecycleContext<TDependencies extends Record<string, unknown>> {
	Container: AppContainer<TDependencies>;
}

export interface AppClientErrorContext<TDependencies extends Record<string, unknown>> extends Omit<
	AppClientLifecycleContext<TDependencies>,
	'useMiddlewares'
> {
	error: unknown;
	event: Parameters<HandleClientError>[0]['event'];
	status: number;
	message: string;
}

export type AppServerInitLifecycleContext = void;

export interface AppServerLifecycleContext<TDependencies extends Record<string, unknown>> {
	Container: AppContainer<TDependencies>;
	requestContext: ContextData;
	event: RequestEvent;
	resolve: Resolve;
	useMiddlewares: (middlewares: IServerMiddleware[]) => Promise<void>;
}

export interface AppServerErrorContext<TDependencies extends Record<string, unknown>> {
	Container: AppContainer<TDependencies>;
	requestContext: ContextData;
	error: unknown;
	event: RequestEvent;
	status: number;
	message: string;
	useLogger: typeof useLogger;
}

export type AppServerFetchContext<TDependencies extends Record<string, unknown>> = Parameters<HandleFetch>[0] & {
	Container: AppContainer<TDependencies>;
	requestContext: ContextData;
};

export type AppServerValidationErrorContext<TDependencies extends Record<string, unknown>> = Parameters<HandleValidationError>[0] & {
	Container: AppContainer<TDependencies>;
	requestContext: ContextData;
};

export interface AppAzureNetKitErrorContext<TDependencies extends Record<string, unknown>> {
	Container: AppContainer<TDependencies>;
	AppEvents: typeof AppEvents;
	error: AppError;
	retry: AsyncHelperRetry;
	isClient: boolean;
	isServer: boolean;
	requestContext?: ContextData;
	event?: RequestEvent;
}

export type AppUniversalLifecycleCallback<TDependencies extends Record<string, unknown>> = (
	context: AppUniversalLifecycleContext<TDependencies>
) => MaybePromise<void>;
export type AppClientLifecycleCallback<TDependencies extends Record<string, unknown>> = (
	context: AppClientLifecycleContext<TDependencies>
) => MaybePromise<void>;
export type AppClientInitLifecycleCallback<TDependencies extends Record<string, unknown>> = (
	context: AppClientInitLifecycleContext<TDependencies>
) => MaybePromise<void>;
export type AppClientErrorCallback<TDependencies extends Record<string, unknown>> = (
	context: AppClientErrorContext<TDependencies>
) => ReturnType<HandleClientError>;
export type AppServerInitLifecycleCallback = ServerInit;
export type AppServerLifecycleCallback<TDependencies extends Record<string, unknown>> = (
	context: AppServerLifecycleContext<TDependencies>
) => MaybePromise<Response | void>;
export type AppServerErrorCallback<TDependencies extends Record<string, unknown>> = (
	context: AppServerErrorContext<TDependencies>
) => ReturnType<HandleServerError>;
export type AppServerFetchCallback<TDependencies extends Record<string, unknown>> = (
	context: AppServerFetchContext<TDependencies>
) => ReturnType<HandleFetch>;
export type AppServerValidationErrorCallback<TDependencies extends Record<string, unknown>> = (
	context: AppServerValidationErrorContext<TDependencies>
) => ReturnType<HandleValidationError>;
export type AppAzureNetKitErrorCallback<TDependencies extends Record<string, unknown>> = (
	context: AppAzureNetKitErrorContext<TDependencies>
) => MaybePromise<IAppError & object>;
export type AppRerouteCallback = Reroute;

export type CreateAppBuilder<TDependencies extends Record<string, unknown>, TFlags extends BuilderFlags = object> = {
	readonly __types__?: TDependencies;
	dependencies<TNext extends AppDependencyFactories<AppContainer<TDependencies>>>(
		dependencies: TNext
	): CreateAppBuilder<TDependencies & ResolvedDependencies<TNext>, TFlags>;
} & OnceMethod<
	TFlags,
	'use',
	{ use(callback: AppUniversalLifecycleCallback<TDependencies>): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'use'>> }
> &
	OnceMethod<
		TFlags,
		'useClient',
		{ useClient(callback: AppClientLifecycleCallback<TDependencies>): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useClient'>> }
	> &
	OnceMethod<
		TFlags,
		'useClientInit',
		{
			useClientInit(callback: AppClientInitLifecycleCallback<TDependencies>): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useClientInit'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useClientError',
		{
			useClientError(callback: AppClientErrorCallback<TDependencies>): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useClientError'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useServerInit',
		{
			useServerInit(callback: AppServerInitLifecycleCallback): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useServerInit'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useServer',
		{ useServer(callback: AppServerLifecycleCallback<TDependencies>): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useServer'>> }
	> &
	OnceMethod<
		TFlags,
		'useServerError',
		{
			useServerError(callback: AppServerErrorCallback<TDependencies>): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useServerError'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useServerFetch',
		{
			useServerFetch(callback: AppServerFetchCallback<TDependencies>): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useServerFetch'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useServerValidationError',
		{
			useServerValidationError(
				callback: AppServerValidationErrorCallback<TDependencies>
			): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useServerValidationError'>>;
		}
	> &
	OnceMethod<
		TFlags,
		'useAzureNetKitError',
		{
			useAzureNetKitError(
				callback: AppAzureNetKitErrorCallback<TDependencies>
			): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useAzureNetKitError'>>;
		}
	> &
	OnceMethod<TFlags, 'useReroute', { useReroute(callback: AppRerouteCallback): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useReroute'>> }> &
	OnceMethod<TFlags, 'useTransport', { useTransport(transport: Transport): CreateAppBuilder<TDependencies, WithFlag<TFlags, 'useTransport'>> }>;

export interface AppRegistrar {
	(): MaybePromise<void>;
	clientInit(): MaybePromise<void>;
	clientError: HandleClientError;
	serverInit: ServerInit;
	serverError: HandleServerError;
	serverFetch: HandleFetch;
	serverValidationError: HandleValidationError;
	handle: Handle;
	reroute: Reroute;
	transport: Transport;
}

export interface CreateAppInstance<TDependencies extends Record<string, unknown>> {
	Container: AppContainer<TDependencies>;
	register: AppRegistrar;
}

type LifecycleKind = 'client' | 'clientInit' | 'serverInit' | 'server';
type UntypedDependencyFactory = AppDependencyFactory<AppContainer<Record<string, unknown>>>;
type LifecycleFlags = Partial<Record<LifecycleKind, true>>;

interface AppCallbacks {
	use?: AppUniversalLifecycleCallback<Record<string, unknown>>;
	useClient?: AppClientLifecycleCallback<Record<string, unknown>>;
	useClientInit?: AppClientInitLifecycleCallback<Record<string, unknown>>;
	useClientError?: AppClientErrorCallback<Record<string, unknown>>;
	useServerInit?: AppServerInitLifecycleCallback;
	useServer?: AppServerLifecycleCallback<Record<string, unknown>>;
	useServerError?: AppServerErrorCallback<Record<string, unknown>>;
	useServerFetch?: AppServerFetchCallback<Record<string, unknown>>;
	useServerValidationError?: AppServerValidationErrorCallback<Record<string, unknown>>;
	useAzureNetKitError?: AppAzureNetKitErrorCallback<Record<string, unknown>>;
	useReroute?: AppRerouteCallback;
	useTransport?: Transport;
}

const DEFAULT_APP_NAME = '__AzureNetKitGlobalAppContainer__';
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

	const flagsMap = (context.data.appLifecycleFlags ??= new WeakMap<object, LifecycleFlags>()) as WeakMap<object, LifecycleFlags>;

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

const createBuilder = (dependencies: Map<string, UntypedDependencyFactory>, callbacks: AppCallbacks): CreateAppBuilder<Record<string, never>> => {
	const builder = {
		use(callback: AppUniversalLifecycleCallback<Record<string, unknown>>) {
			setCallback(callbacks, 'use', callback);
			return builder;
		},

		useClient(callback: AppClientLifecycleCallback<Record<string, unknown>>) {
			setCallback(callbacks, 'useClient', callback);
			return builder;
		},

		useClientInit(callback: AppClientInitLifecycleCallback<Record<string, unknown>>) {
			setCallback(callbacks, 'useClientInit', callback);
			return builder;
		},

		useClientError(callback: AppClientErrorCallback<Record<string, unknown>>) {
			setCallback(callbacks, 'useClientError', callback);
			return builder;
		},

		useServerInit(callback: AppServerInitLifecycleCallback) {
			setCallback(callbacks, 'useServerInit', callback);
			return builder;
		},

		useServer(callback: AppServerLifecycleCallback<Record<string, unknown>>) {
			setCallback(callbacks, 'useServer', callback);
			return builder;
		},

		useServerError(callback: AppServerErrorCallback<Record<string, unknown>>) {
			setCallback(callbacks, 'useServerError', callback);
			return builder;
		},

		useServerFetch(callback: AppServerFetchCallback<Record<string, unknown>>) {
			setCallback(callbacks, 'useServerFetch', callback);
			return builder;
		},

		useServerValidationError(callback: AppServerValidationErrorCallback<Record<string, unknown>>) {
			setCallback(callbacks, 'useServerValidationError', callback);
			return builder;
		},

		useAzureNetKitError(callback: AppAzureNetKitErrorCallback<Record<string, unknown>>) {
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
		},

		dependencies(nextDependencies: AppDependencyFactories<AppContainer<Record<string, unknown>>>) {
			for (const [key, factory] of Object.entries(nextDependencies)) {
				dependencies.set(key, factory as UntypedDependencyFactory);
			}

			return builder;
		}
	};

	return builder as unknown as CreateAppBuilder<Record<string, never>>;
};

export const createApp = <TBuilder>(
	callback: (app: CreateAppBuilder<Record<string, never>>) => TBuilder,
	name = DEFAULT_APP_NAME
): CreateAppInstance<BuilderDependencies<TBuilder> & Record<string, unknown>> => {
	const appKey = {};
	const dependencies = new Map<string, UntypedDependencyFactory>();
	const callbacks: AppCallbacks = {};
	let clientInitialized = false;
	let serverInitPromise: Promise<void> | undefined;

	callback(createBuilder(dependencies, callbacks));

	const AppProvider = createBoundaryProvider(name, {
		register: () => {
			const factories = {} as ServiceFactories<Record<string, UntypedDependencyFactory>>;

			for (const [key, factory] of dependencies.entries()) {
				factories[key] = () => factory(Container as AppContainer<Record<string, unknown>>);
			}

			return factories;
		}
	});

	const Container = new Proxy({} as AppContainer<BuilderDependencies<TBuilder> & Record<string, unknown>>, {
		get(_, key: string | symbol) {
			if (typeof key === 'symbol') return undefined;
			return AppProvider()[key];
		},

		has(_, key: string | symbol) {
			return typeof key === 'string' && key in AppProvider();
		},

		ownKeys() {
			return Reflect.ownKeys(AppProvider());
		},

		getOwnPropertyDescriptor(_, key: string | symbol) {
			if (typeof key !== 'string' || !(key in AppProvider())) return undefined;

			return {
				configurable: true,
				enumerable: true,
				value: AppProvider()[key]
			};
		}
	});

	const errorResolver: AzureNetKitErrorResolver | undefined = callbacks.useAzureNetKitError
		? (error, retry) => {
				const requestContext = BROWSER ? undefined : getRequestContext();
				return callbacks.useAzureNetKitError!({
					Container,
					AppEvents,
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
		if (flags[kind]) return undefined;
		flags[kind] = true;

		if (kind === 'clientInit') {
			const universalContext: AppUniversalLifecycleContext<Record<string, unknown>> = {
				Container,
				isClient: true,
				isServer: false
			};
			const universalResult = callbacks.use?.(universalContext);
			if (universalResult && typeof (universalResult as Promise<void>).then === 'function') {
				return (universalResult as Promise<void>).then(() => callbacks.useClientInit?.({ Container }));
			}

			return callbacks.useClientInit?.({ Container });
		}
		let internalMiddlewares: IClientMiddleware[] = [];
		const clientResult = callbacks.useClient?.({
			Container,
			useMiddlewares: (middlewares: IClientMiddleware[]) => {
				internalMiddlewares = middlewares;
			}
		});
		const registerNavigation = () => {
			if (clientInitialized) return;
			clientInitialized = true;
			beforeNavigate((navigation) => {
				executeClientMiddlewares(internalMiddlewares, navigation);
			});
		};

		if (clientResult && typeof (clientResult as Promise<void>).then === 'function') {
			return (clientResult as Promise<void>).then(registerNavigation);
		}

		registerNavigation();
	};

	const runServerInit: ServerInit = () => {
		if (BROWSER) return undefined;
		serverInitPromise ??= Promise.resolve().then(() => callbacks.useServerInit?.());
		return serverInitPromise;
	};

	const runServerError: HandleServerError = ({ error, event, status, message }) => {
		if (BROWSER) return undefined;
		const requestContext = getServerRequestContext();
		bindErrorResolver(requestContext);

		try {
			const result = callbacks.useServerError?.({
				Container,
				requestContext,
				error,
				event,
				status,
				message,
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

	const runClientError: HandleClientError = ({ error, event, status, message }) => {
		if (!BROWSER) return undefined;
		bindErrorResolver();

		return callbacks.useClientError?.({
			Container,
			error,
			event,
			status,
			message
		});
	};

	const runServerFetch: HandleFetch = (input) => {
		if (!callbacks.useServerFetch) return input.fetch(input.request);

		return callbacks.useServerFetch({
			...input,
			Container,
			requestContext: getServerRequestContext()
		});
	};

	const runServerValidationError: HandleValidationError = (input) => {
		if (!callbacks.useServerValidationError) {
			console.error('Remote function schema validation failed:', input.issues);
			return { message: 'Bad Request' };
		}

		return callbacks.useServerValidationError({
			...input,
			Container,
			requestContext: getServerRequestContext()
		});
	};

	const reroute: Reroute = (input) => callbacks.useReroute?.(input);

	const handle: Handle = async ({ event, resolve }) => {
		const requestContext = getServerRequestContext();
		bindErrorResolver(requestContext);

		try {
			const flags = getLifecycleFlags(appKey, requestContext);

			if (!flags.server) {
				flags.server = true;

				const universalResult = callbacks.use?.({
					Container,
					isClient: false,
					isServer: true,
					requestContext,
					event
				});

				if (universalResult && typeof (universalResult as Promise<void>).then === 'function') {
					await universalResult;
				}

				const serverResult = await callbacks.useServer?.({
					Container,
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

	const register = Object.assign(() => runClient('client'), {
		clientInit: () => runClient('clientInit'),
		clientError: runClientError,
		serverInit: runServerInit,
		serverError: runServerError,
		serverFetch: runServerFetch,
		serverValidationError: runServerValidationError,
		handle,
		reroute,
		transport: callbacks.useTransport ?? {}
	}) as AppRegistrar;

	return {
		Container,
		register
	};
};
