//import { createErrorParser, type AppError, type ErrorType } from '$lib/core/provider/dependencies/ErrorHandler.js';

// type ActionResponse<T, D = unknown> = {
// 	response: T;
// 	error: AppError<D>;
// 	success: boolean;
// 	abortReason?: unknown;
// };

// export const createAsyncHelpers = (opts?: {
// 	parseError?: ReturnType<typeof createErrorParser>
// }) => {
// 	const errorParser = opts?.parseError ?? createErrorParser();
//
// 	const createAsyncAction = async <Res, Req = unknown>(
// 		action: Promise<Res>,
// 		args?: {
// 			onSuccess?: (result: ActionResponse<Res, undefined>) => Promise<unknown> | unknown;
// 			onError?: (result: ActionResponse<never, Req>) => Promise<unknown> | unknown;
// 			reject?: boolean;
// 			abort?: {
// 				condition: boolean;
// 				reason?: unknown;
// 				onAbort?: (reason?: unknown) => void;
// 			};
// 			errorResponse?: Res;
// 		}
// 	): Promise<ActionResponse<Res, Req>> => {
// 		if (args?.abort?.condition) {
// 			args.abort.onAbort?.(args.abort.reason);
// 			return {
// 				success: false,
// 				abortReason: args.abort.reason,
// 				response: undefined
// 			};
// 		}
//
// 		try {
// 			const response = await action;
// 			const result = { response, success: true } as ActionResponse<Res, Req>;
// 			await args?.onSuccess?.(result as ActionResponse<Res, undefined>);
// 			return result;
// 		} catch (err) {
// 			const error = errorParser<Req>(err as ErrorType<Req>);
// 			if (args?.reject) throw error;
// 			const result = { error, response: args?.errorResponse, success: false } as ActionResponse<Res, Req>;
// 			await args?.onError?.(result as ActionResponse<never, Req>);
// 			return result;
// 		}
// 	};
//
// 	const createAsyncResource = async <Res, Req = unknown>(
// 		action: Promise<Res>,
// 		args?: {
// 			onError?: (error: AppError<Req>) => Promise<unknown> | unknown;
// 			reject?: boolean;
// 			abort?: {
// 				condition: boolean;
// 				reason?: unknown;
// 				onAbort?: (reason?: unknown) => void;
// 			};
// 			fallback?: Res;
// 		}
// 	): Promise<Res | undefined> => {
// 		if (args?.abort?.condition) {
// 			args.abort.onAbort?.(args.abort.reason);
// 			return args.fallback;
// 		}
//
// 		try {
// 			return await action;
// 		} catch (err) {
// 			const error = errorParser<Req>(err as ErrorType<Req>);
// 			await args?.onError?.(error);
// 			if (args?.reject) throw error;
// 			return args.fallback;
// 		}
// 	};
//
// 	return {
// 		createAsyncAction,
// 		createAsyncResource
// 	};
// };
