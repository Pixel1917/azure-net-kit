import { AppError, AzureNetKitInternalError, type IAppError } from '../app-error/index.js';
import { BROWSER } from '../../external/tools/index.js';
import { RequestContext } from '../../external/edges/ServerContext.js';

export enum LoggerErrors {
	AzureNetKitInternal,
	AzureNetAppError,
	ProjectError,
	UnknownError
}

export interface ILoggerError {
	message: string;
	type: LoggerErrors;
	original: Error | IAppError | AppError;
}

export interface ILoggerSettings {
	collector?: { request: (error: ILoggerError) => Request; onError?: (error: unknown) => void };
	prefix?: string;
	joinToLog?: (error: ILoggerError) => string;
	filterLog?: (error: ILoggerError) => boolean;
	includeOnly?: LoggerErrors[];
}

const prepareError = (error: unknown): ILoggerError => {
	if (error instanceof AppError || (error && typeof error === 'object' && 'appErrorConvert' in error)) {
		const typedError = error as AppError | IAppError;
		return {
			original: typedError,
			message: `[AppError ${typedError.type}] ${typedError.message}`,
			type: LoggerErrors.AzureNetAppError
		};
	}
	if (error instanceof AzureNetKitInternalError) {
		return {
			original: error,
			message: `[AzureNetInternalError] ${error.message}`,
			type: LoggerErrors.AzureNetKitInternal
		};
	}
	if (error instanceof Error) {
		return {
			original: error,
			message: error.message,
			type: LoggerErrors.ProjectError
		};
	}
	return {
		original: new Error('Unknown error occurred'),
		message: 'Unknown error occurred',
		type: LoggerErrors.UnknownError
	};
};

const getFetcher = (): typeof fetch => {
	if (BROWSER) return fetch;

	try {
		return RequestContext.current()?.event?.fetch ?? fetch;
	} catch {
		return fetch;
	}
};

export const useLogger = (error: unknown, settings: ILoggerSettings) => {
	const preparedError = prepareError(error);
	if (settings.filterLog && settings.filterLog(preparedError)) {
		return;
	}
	if (settings.includeOnly && !settings.includeOnly.includes(preparedError.type)) {
		return;
	}
	const prefix = settings?.prefix ?? '[Logger]';
	const errorMessage = prefix + preparedError.message + (settings?.joinToLog ? settings.joinToLog(preparedError) : '');
	console.log(errorMessage);
	if (settings.collector) {
		const fetcher = getFetcher();
		try {
			void fetcher(settings.collector.request(preparedError)).catch((err) => {
				settings.collector?.onError?.(err);
				return;
			});
		} catch (err) {
			settings.collector.onError?.(err);
		}
	}
};
