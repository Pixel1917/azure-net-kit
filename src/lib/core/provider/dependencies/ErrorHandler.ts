import { BaseRequest, type RequestErrors } from '$lib/core/request/index.js';
import { HttpServiceError } from '$lib/core/httpService/index.js';

export type AppErrorType = 'http' | 'request' | 'app' | 'abort';

export interface AppError<T = unknown, D = never> {
	type: AppErrorType;
	message: string;
	fields?: RequestErrors<T>;
	status?: number;
	original?: HttpServiceError<T> | BaseRequest<T, T> | Error;
	custom?: D;
}

export type ErrorType<T = unknown> = Error | BaseRequest<T, T> | HttpServiceError<T>;

export const parseHttpError = <T = unknown, D = never>(error: HttpServiceError<T>): AppError<T, D> => {
	return {
		type: 'http',
		message: error.message ?? 'unexpected error',
		status: error.status ?? 500,
		original: error
	};
};

export const parseRequestError = <T = unknown, D = never>(error: BaseRequest<T, T>): AppError<T, D> => {
	return {
		type: 'request',
		message: 'validation error',
		status: 422,
		fields: error.getErrors(),
		original: error
	};
};

export const parseBaseError = <D = never>(error: Error): AppError<never, D> => {
	return {
		type: 'app',
		message: error.message,
		original: error
	};
};

export const createErrorParser = <Custom = unknown>(
	customHandler?: <T = unknown>(
		error: ErrorType<T>,
		utils: {
			parseBaseError: typeof parseBaseError;
			parseRequestError: typeof parseRequestError;
			parseHttpError: typeof parseHttpError;
		}
	) => AppError<T, Custom>
): (<T>(error: ErrorType<T>) => AppError<T, Custom>) => {
	return <T = unknown>(error: ErrorType<T>) => {
		if (customHandler) {
			return customHandler<T>(error, {
				parseBaseError,
				parseRequestError,
				parseHttpError
			});
		} else {
			switch (true) {
				case error instanceof HttpServiceError:
					return parseHttpError<T>(error);
				case error instanceof BaseRequest:
					return parseRequestError<T>(error);
				default:
					return parseBaseError<Custom>(error);
			}
		}
	};
};
