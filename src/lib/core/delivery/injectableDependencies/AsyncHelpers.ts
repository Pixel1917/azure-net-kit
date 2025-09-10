import { createErrorParser, type AppError, type ErrorType } from './ErrorHandler.js';

export interface AsyncActionResponse<T, D = unknown, CustomErrorField = never> {
	success: boolean;
	response: T;
	error?: AppError<D, CustomErrorField>;
}

type ActionOrThunk<Res> = Promise<Res> | (() => Promise<Res>);

export const createAsyncHelpers = <Custom = unknown>(opts?: { parseError?: ReturnType<typeof createErrorParser<Custom>> }) => {
	const errorParser = opts?.parseError ?? createErrorParser();

	const createAsyncAction = async <Res = unknown, Req = unknown>(
		action: ActionOrThunk<Res>,
		args?: {
			onSuccess?: (result: AsyncActionResponse<Res, undefined, Custom>) => Promise<unknown> | unknown;
			onError?: (result: AsyncActionResponse<never, Req, Custom>) => Promise<unknown> | unknown;
			reject?: boolean;
			abort?: {
				condition: boolean;
				onAbort?: () => void;
			};
			fallbackResponse?: Res;
		}
	): Promise<AsyncActionResponse<Res, Req, Custom>> => {
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
			const response = await Promise.resolve(typeof action === 'function' ? (action as () => Promise<Res>)() : action);
			const result = { response, success: true } as AsyncActionResponse<Res, Req, Custom>;
			await args?.onSuccess?.(result as AsyncActionResponse<Res, undefined, Custom>);
			return result;
		} catch (err) {
			const error = errorParser<Req>(err as ErrorType<Req>);
			if (args?.reject) throw error;
			const result = { error, response: args?.fallbackResponse as Res, success: false };
			await args?.onError?.(result as AsyncActionResponse<never, Req, Custom>);
			return result;
		}
	};

	const createAsyncResource = async <Res, Req = unknown>(
		action: ActionOrThunk<Res>,
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
			const response = await Promise.resolve(typeof action === 'function' ? (action as () => Promise<Res>)() : action);
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
