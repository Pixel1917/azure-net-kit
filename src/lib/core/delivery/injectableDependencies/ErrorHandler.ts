import { HttpServiceError } from '../../infra/httpService/index.js';
import { SchemaFail, type RequestErrors } from '../schema/index.js';

export type AppErrorType = 'http' | 'app' | 'schema' | 'abort';

export interface AppError<T = unknown, CustomErrorField = never> {
	type: AppErrorType;
	message: string;
	fields?: RequestErrors<T>;
	status?: number;
	original?: HttpServiceError<T> | SchemaFail<T> | Error;
	custom?: CustomErrorField;
	retry?: () => unknown;
}

export type ErrorType<T = unknown> = Error | HttpServiceError<T> | SchemaFail<T>;

export const baseParseHttpError = async <T = unknown, D = never>(
	error: HttpServiceError<T>,
	retry?: () => unknown | Promise<unknown>
): Promise<AppError<T, D>> => {
	const err: AppError<T, D> = {
		type: 'http',
		message: error.message ?? 'unexpected error',
		status: error.status ?? 500,
		original: error,
		retry
	};

	return { ...err, retry: undefined, original: undefined };
};

export const baseParseSchemaError = async <SchemaData = unknown, D = never>(
	error: SchemaFail<SchemaData>,
	retry?: () => unknown | Promise<unknown>
): Promise<AppError<SchemaData, D>> => {
	const err: AppError<SchemaData, D> = {
		type: 'schema',
		message: 'schema validation error',
		status: 422,
		fields: error.getErrors(),
		original: error,
		retry
	};

	return { ...err, retry: undefined, original: undefined };
};

export const baseParseBaseError = async <D = never>(error: Error, retry?: () => unknown | Promise<unknown>): Promise<AppError<never, D>> => {
	const err: AppError<never, D> = {
		type: 'app',
		message: error.message,
		original: error,
		retry
	};

	return { ...err, retry: undefined, original: undefined };
};

export const createErrorParser = <BaseError = unknown, Custom = unknown>(parsers?: {
	parseBaseError?: typeof baseParseBaseError<Custom>;
	parseHttpError?: typeof baseParseHttpError<BaseError, Custom>;
	parseSchemaError?: typeof baseParseSchemaError<BaseError, Custom>;
}): (<T = unknown>(error: ErrorType<BaseError>, retry?: () => unknown | Promise<unknown>) => Promise<AppError<T, Custom>>) => {
	return async <T = unknown>(error: ErrorType<BaseError>, retry?: () => unknown | Promise<unknown>) => {
		const { parseBaseError = baseParseBaseError, parseHttpError = baseParseHttpError, parseSchemaError = baseParseSchemaError } = parsers ?? {};

		switch (true) {
			case error instanceof HttpServiceError:
				return (await parseHttpError(error, retry)) as AppError<T, Custom>;
			case error instanceof SchemaFail:
				return (await parseSchemaError(error, retry)) as AppError<T, Custom>;
			default:
				return (await parseBaseError(error, retry)) as AppError<T, Custom>;
		}
	};
};
