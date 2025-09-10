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
}

export type ErrorType<T = unknown> = Error | HttpServiceError<T> | SchemaFail<T>;

export const baseParseHttpError = <T = unknown, D = never>(error: HttpServiceError<T>): AppError<T, D> => {
	return {
		type: 'http',
		message: error.message ?? 'unexpected error',
		status: error.status ?? 500,
		original: error
	};
};

export const baseParseSchemaError = <SchemaData = unknown, D = never>(error: SchemaFail<SchemaData>): AppError<SchemaData, D> => {
	return {
		type: 'schema',
		message: 'schema validation error',
		status: 422,
		fields: error.getErrors(),
		original: error
	};
};

export const baseParseBaseError = <D = never>(error: Error): AppError<never, D> => {
	return {
		type: 'app',
		message: error.message,
		original: error
	};
};

export const createErrorParser = <Custom = unknown>(parsers?: {
	parseBaseError?: typeof baseParseBaseError;
	parseHttpError?: typeof baseParseHttpError;
	parseSchemaError?: typeof baseParseSchemaError;
}): (<T>(error: ErrorType<T>) => AppError<T, Custom>) => {
	return <T = unknown>(error: ErrorType<T>) => {
		const { parseBaseError = baseParseBaseError, parseHttpError = baseParseHttpError, parseSchemaError = baseParseSchemaError } = parsers ?? {};

		switch (true) {
			case error instanceof HttpServiceError:
				return parseHttpError<T>(error);
			case error instanceof SchemaFail:
				return parseSchemaError<T>(error);
			default:
				return parseBaseError<Custom>(error);
		}
	};
};
