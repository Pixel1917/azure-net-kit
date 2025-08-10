import { createErrorParser, type AppError, type ErrorType } from './ErrorHandler.js';

export const createAsyncHelpers = <Custom = unknown>(opts?: { parseError?: ReturnType<typeof createErrorParser<Custom>> }) => {
	type ActionResponse<T, D = unknown> = {
		success: boolean;
		response: T;
		error?: AppError<D, Custom>;
	};

	const errorParser = opts?.parseError ?? createErrorParser();

	const createAsyncAction = async <Req = unknown, Res = unknown>(
		action: Promise<Res>,
		args?: {
			onSuccess?: (result: ActionResponse<Res, undefined>) => Promise<unknown> | unknown;
			onError?: (result: ActionResponse<never, Req>) => Promise<unknown> | unknown;
			reject?: boolean;
			abort?: {
				condition: boolean;
				onAbort?: () => void;
			};
			fallbackResponse?: Res;
		}
	): Promise<ActionResponse<Res, Req>> => {
		if (args?.abort?.condition) {
			args.abort.onAbort?.();
			const abortError: AppError<Req, Custom> = {
				type: 'abort',
				message: 'aborted',
				original: new Error('aborted')
			};
			if (args?.reject) throw abortError;
			return {
				success: false,
				error: abortError,
				response: args?.fallbackResponse as Res
			};
		}

		try {
			const response = await action;
			const result = { response, success: true } as ActionResponse<Res, Req>;
			await args?.onSuccess?.(result as ActionResponse<Res, undefined>);
			return result;
		} catch (err) {
			const error = errorParser<Req>(err as ErrorType<Req>);
			if (args?.reject) throw error;
			const result = { error, response: args?.fallbackResponse as Res, success: false };
			await args?.onError?.(result as ActionResponse<never, Req>);
			return result;
		}
	};

	const createAsyncResource = async <Res, Req = unknown>(
		action: Promise<Res>,
		args?: {
			onSuccess?: (result: Res) => Promise<unknown> | unknown;
			onError?: (error: AppError<Req, Custom>) => Promise<unknown> | unknown;
			reject?: boolean;
			abort?: {
				condition: boolean;
				onAbort?: () => void;
			};
			fallbackResponse?: Res;
		}
	): Promise<Res> => {
		if (args?.abort?.condition) {
			args.abort.onAbort?.();
			return args.fallbackResponse as Res;
		}

		try {
			const response = await action;
			await args?.onSuccess?.(response);
			return response;
		} catch (err) {
			const error = errorParser<Req>(err as ErrorType<Req>);
			await args?.onError?.(error);
			if (args?.reject) throw error;
			return args?.fallbackResponse as Res;
		}
	};

	return {
		createAsyncAction,
		createAsyncResource
	};
};
