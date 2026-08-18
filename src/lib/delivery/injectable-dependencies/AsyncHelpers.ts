import { AsyncHelperError, type AppError, type IAppError } from '../../shared/app-error/AppError.js';
import { resolveAzureNetKitError } from '../../shared/app-error/ErrorRuntime.js';

export type { AsyncHelperRetry } from '../../shared/app-error/ErrorRuntime.js';

export interface AsyncActionResponse<T, D = never, ErrorResult = Record<never, never>> {
	success: boolean;
	response: T;
	error?: IAppError<D> & ErrorResult;
}

type Action<Res> = () => Promise<Res>;

export interface AsyncActionSettings<Res = never, Req = never, ErrorResult = AppError<Error>> {
	beforeSend?: (actions: { next: () => void; abort: (reason?: Error) => void }) => void | Promise<void>;
	onSuccess?: (result: AsyncActionResponse<Res, never, ErrorResult>) => Promise<unknown> | unknown;
	onError?: (result: AsyncActionResponse<never, Req, ErrorResult>) => Promise<unknown> | unknown;
	fallbackResponse?: Res;
}

export interface AsyncResourceSettings<Res = never, Req = never, ErrorResult = AppError<Error>> extends AsyncActionSettings<Res, Req, ErrorResult> {
	reject?: boolean;
}

export const createAsyncHelpers = <ErrorResult extends object>() => {
	const normalizeError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

	const prepareErrors = async <Res = never, Req = never>(error: Error, retry?: () => Promise<AsyncActionResponse<Res, Req, ErrorResult>>) => {
		let retryResult: AsyncActionResponse<Res, Req, ErrorResult> | undefined = undefined;
		const retryFunc = async () => {
			if (retry) {
				return await retry()
					.then((res) => {
						retryResult = res;
						return undefined;
					})
					.catch((err) => normalizeError(err));
			}
		};
		const parsedError = await resolveAzureNetKitError<Req, ErrorResult>(normalizeError(error), {
			can: !!retry,
			call: retry ? () => retryFunc() : undefined
		});
		return { error: parsedError, retryResult };
	};

	const beforeSendResolver = async <Res = never, Req = never>(
		settings?: AsyncActionSettings<Res, Req, ErrorResult>
	): Promise<AsyncActionResponse<never, Req, ErrorResult> | undefined> => {
		if (!settings?.beforeSend) return undefined;

		let abortReason: Error | undefined;
		let aborted = false;
		await new Promise<void>((resolve) => {
			let settled = false;
			const beforeSend = settings.beforeSend!;
			const guardTimer = setTimeout(() => {
				settle(true);
			}, 30000);
			const settle = (isAbort: boolean, reason?: Error) => {
				if (settled) return;
				settled = true;
				clearTimeout(guardTimer);
				aborted = isAbort;
				abortReason = reason;
				resolve();
			};
			const next = () => settle(false);
			const abort = (reason?: Error) => settle(true, reason);
			try {
				const maybePromise = beforeSend({ next, abort });
				if (maybePromise && typeof (maybePromise as PromiseLike<void>).then === 'function') {
					(maybePromise as PromiseLike<void>).then(
						() => settle(false),
						(err: unknown) => settle(true, normalizeError(err))
					);
					return;
				}
				settle(false);
			} catch (err: unknown) {
				settle(true, normalizeError(err));
			}
		});

		if (!aborted) return undefined;

		const { error } = await prepareErrors<Res, Req>(abortReason ?? new AsyncHelperError('Aborted in beforeSend'));
		return {
			success: false,
			error,
			response: undefined as never
		};
	};

	const createAsyncAction = async <Res = never, Req = never>(
		action: Action<Res>,
		args?: AsyncActionSettings<Res, Req, ErrorResult>
	): Promise<AsyncActionResponse<Res, Req, ErrorResult>> => {
		const beforeSendResult = await beforeSendResolver(args);
		if (beforeSendResult) return beforeSendResult;

		const executeAction = async () => {
			const response = await Promise.resolve(action());
			return { response, success: true } as AsyncActionResponse<Res, never, ErrorResult>;
		};

		const handleFailure = async (
			err: unknown,
			retry?: () => Promise<AsyncActionResponse<Res, Req, ErrorResult>>
		): Promise<AsyncActionResponse<Res, Req, ErrorResult>> => {
			const { error, retryResult } = await prepareErrors<Res, Req>(normalizeError(err), retry);
			if (retryResult) {
				return completeSuccess(retryResult);
			}
			const result = { error, response: args?.fallbackResponse as Res, success: false };
			try {
				await args?.onError?.(result as AsyncActionResponse<never, Req, ErrorResult>);
			} catch (onErrorException) {
				throw await resolveAzureNetKitError<Req, ErrorResult>(
					new AsyncHelperError('onError caught exception', { cause: normalizeError(onErrorException) })
				);
			}
			return result;
		};

		const completeSuccess = async (result: AsyncActionResponse<Res, Req, ErrorResult>): Promise<AsyncActionResponse<Res, Req, ErrorResult>> => {
			try {
				await args?.onSuccess?.(result as AsyncActionResponse<Res, never, ErrorResult>);
				return result;
			} catch (err) {
				return handleFailure(err);
			}
		};

		try {
			return completeSuccess(await executeAction());
		} catch (err) {
			return handleFailure(err, executeAction);
		}
	};

	const createAsyncResource = async <Res = never, Req = never>(
		action: Action<Res>,
		args?: AsyncResourceSettings<Res, Req, ErrorResult>
	): Promise<Res> => {
		const result = await createAsyncAction(action, args);
		if (!result.success && args?.reject) {
			throw result.error;
		}
		return result.response;
	};

	return {
		createAsyncAction,
		createAsyncResource
	};
};
