import { type AppError, createErrorParser, type ErrorType } from './ErrorHandler.js';
import { AppEvents } from '$lib/core/index.js';

export interface AsyncActionResponse<T, D = unknown, CustomErrorField = never> {
	success: boolean;
	response: T;
	error?: AppError<D, CustomErrorField>;
}

type ActionOrThunk<Res> = Promise<Res> | (() => Promise<Res>);

export const createAsyncHelpers = <BaseError = unknown, Custom = unknown>(opts?: {
	parseError?: ReturnType<typeof createErrorParser<BaseError, Custom>>;
}) => {
	const errorParser = opts?.parseError ?? createErrorParser();

	const createAsyncAction = async <Res = unknown, Req = unknown>(
		action: ActionOrThunk<Res>,
		args?: {
			beforeSend?: (next: () => void, abort: () => void) => void | Promise<void>;
			onSuccess?: (result: AsyncActionResponse<Res, undefined, Custom>) => Promise<unknown> | unknown;
			onError?: (result: AsyncActionResponse<never, Req, Custom>) => Promise<unknown> | unknown;
			reject?: boolean;
			abort?: {
				condition: boolean;
				onAbort?: () => void;
			};
			fallbackResponse?: Res;
			maxRetries?: number;
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

		if (args?.beforeSend) {
			const beforeSendResult = await new Promise<'next' | 'abort'>((resolve) => {
				const next = () => resolve('next');
				const abort = () => resolve('abort');
				Promise.resolve(args.beforeSend!(next, abort)).catch((err) => {
					console.error('Error in beforeSend:', err);
					resolve('abort');
				});
			});

			if (beforeSendResult === 'abort') {
				const abortError: AppError<Req, Custom> = {
					type: 'abort',
					message: 'Aborted in beforeSend',
					original: new Error('Aborted in beforeSend')
				};
				if (args?.reject) throw abortError;
				return {
					success: false,
					error: abortError,
					response: args?.fallbackResponse as Res
				};
			}
		}

		const maxRetries = args?.maxRetries ?? 3;
		let retries = 0;
		const req = async (isRetry: boolean = false) => {
			if (isRetry) {
				retries++;
				if (retries > maxRetries) {
					return Promise.reject(Error('Max retries reached'));
				}
			}
			const response = await Promise.resolve(typeof action === 'function' ? action() : action);
			const result = { response, success: true } as AsyncActionResponse<Res, Req, Custom>;
			await args?.onSuccess?.(result as AsyncActionResponse<Res, undefined, Custom>);
			return result;
		};
		try {
			return await req();
		} catch (err) {
			let retryResult;
			const retry = async () =>
				await req(true)
					.then((res) => (retryResult = res))
					.catch(() => undefined);
			const error = await errorParser<Req>(err as ErrorType<BaseError>, async () => await retry());
			if (retryResult) {
				return retryResult;
			}
			const { bus } = AppEvents();
			bus.publish('OnAsyncHelperError', error);
			const result = { error, response: args?.fallbackResponse as Res, success: false };
			await args?.onError?.(result as AsyncActionResponse<never, Req, Custom>);
			if (args?.reject) throw error;
			return result;
		}
	};

	const createAsyncResource = async <Res, Req = unknown>(
		action: ActionOrThunk<Res>,
		args?: {
			beforeSend?: (next: () => void, abort: () => void) => void | Promise<void>;
			onSuccess?: (result: Res) => Promise<unknown> | unknown;
			onError?: (error: AppError<Req, Custom>) => Promise<unknown> | unknown;
			reject?: boolean;
			abort?: {
				condition: boolean;
				onAbort?: () => void;
			};
			fallbackResponse?: Res;
			maxRetries?: number;
		}
	): Promise<Res> => {
		if (args?.abort?.condition) {
			args.abort.onAbort?.();
			return args.fallbackResponse as Res;
		}

		if (args?.beforeSend) {
			const beforeSendResult = await new Promise<'next' | 'abort'>((resolve) => {
				const next = () => resolve('next');
				const abort = () => resolve('abort');

				Promise.resolve(args.beforeSend!(next, abort)).catch((err) => {
					console.error('Error in beforeSend:', err);
					resolve('abort');
				});
			});

			if (beforeSendResult === 'abort') {
				if (args?.reject) {
					throw {
						type: 'abort',
						message: 'Aborted in beforeSend',
						original: new Error('Aborted in beforeSend')
					};
				}
				return args.fallbackResponse as Res;
			}
		}

		const maxRetries = args?.maxRetries ?? 3;
		let retries = 0;
		const req = async (isRetry: boolean = false) => {
			if (isRetry) {
				retries++;
				if (retries > maxRetries) {
					return Promise.reject(Error('Max retries reached'));
				}
			}
			const response = await Promise.resolve(typeof action === 'function' ? action() : action);
			await args?.onSuccess?.(response);
			return response;
		};
		try {
			return await req();
		} catch (err) {
			let retryResult;
			const retry = async () =>
				await req(true)
					.then((res) => (retryResult = res))
					.catch(() => undefined);
			const error = await errorParser<Req>(err as ErrorType<BaseError>, async () => await retry());
			if (retryResult) {
				return retryResult;
			}
			const { bus } = AppEvents();
			bus.publish('OnAsyncHelperError', error);
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
