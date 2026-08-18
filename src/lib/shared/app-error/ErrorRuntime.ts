import { BROWSER } from '../../external/tools/index.js';
import { RequestContext, type ContextData } from '../../external/edges/ServerContext.js';
import { AppError, AzureNetKitInternalError, type IAppError } from './AppError.js';

type MaybePromise<T> = T | Promise<T>;

export interface AsyncHelperRetry {
	can: boolean;
	call?: () => Promise<Error | void>;
}

export type AzureNetKitErrorResolver = (error: AppError, retry: AsyncHelperRetry) => MaybePromise<IAppError & object>;

interface ErrorRuntimeBinding {
	resolver: AzureNetKitErrorResolver;
	activeErrors?: WeakSet<Error>;
}

const SERVER_BINDING_KEY = Symbol('azureNetKitErrorResolver');
let clientBinding: ErrorRuntimeBinding | undefined;

const createBinding = (resolver: AzureNetKitErrorResolver): ErrorRuntimeBinding => ({ resolver });

const getServerData = (requestContext?: ContextData): Record<PropertyKey, unknown> | undefined => {
	if (requestContext) return requestContext.data as Record<PropertyKey, unknown>;

	try {
		return RequestContext.current().data as Record<PropertyKey, unknown>;
	} catch {
		return undefined;
	}
};

export const bindAzureNetKitErrorResolver = (resolver?: AzureNetKitErrorResolver, requestContext?: ContextData): void => {
	if (BROWSER) {
		clientBinding = resolver ? createBinding(resolver) : undefined;
		return;
	}

	const data = getServerData(requestContext);
	if (!data) return;

	if (resolver) {
		data[SERVER_BINDING_KEY] = createBinding(resolver);
	} else {
		delete data[SERVER_BINDING_KEY];
	}
};

const getBinding = (): ErrorRuntimeBinding | undefined => {
	if (BROWSER) return clientBinding;
	return getServerData()?.[SERVER_BINDING_KEY] as ErrorRuntimeBinding | undefined;
};

const normalizeError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export const resolveAzureNetKitError = async <Validation = unknown, CustomData extends object = Record<never, never>>(
	error: unknown,
	retry: AsyncHelperRetry = { can: false }
): Promise<IAppError<Validation> & CustomData> => {
	const normalizedError = normalizeError(error);
	const appError = normalizedError instanceof AppError ? normalizedError : new AppError<Validation>(normalizedError);
	const binding = getBinding();

	if (!binding || binding.activeErrors?.has(normalizedError)) {
		return appError.toPlainObject<CustomData>() as IAppError<Validation> & CustomData;
	}

	const activeErrors = (binding.activeErrors ??= new WeakSet());
	activeErrors.add(normalizedError);
	try {
		const result = await binding.resolver(appError, retry);
		if (!result?.appErrorConvert) {
			throw new AzureNetKitInternalError("[createApp] 'useAzureNetKitError' must return the result of AppError.toPlainObject().");
		}
		return result as IAppError<Validation> & CustomData;
	} finally {
		activeErrors.delete(normalizedError);
	}
};
