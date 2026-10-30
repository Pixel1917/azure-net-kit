import { AsyncHelperError, AppError, type IAppError } from '../../shared/app-error/AppError.js';

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

const normalizeError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

const prepareError = <Req, ErrorResult extends object>(error: unknown): IAppError<Req> & ErrorResult => {
	const normalized = normalizeError(error);
	const appError = normalized instanceof AppError ? (normalized as AppError<Req>) : new AppError<Req>(normalized);
	return appError.toPlainObject<ErrorResult>();
};

const beforeSendResolver = async <Res = never, Req = never, ErrorResult extends object = Record<never, never>>(
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

	const error = prepareError<Req, ErrorResult>(abortReason ?? new AsyncHelperError('Aborted in beforeSend'));
	return {
		success: false,
		error,
		response: undefined as never
	};
};

export const createAsyncAction = async <Res = never, Req = never, ErrorResult extends object = Record<never, never>>(
	action: Action<Res>,
	args?: AsyncActionSettings<Res, Req, ErrorResult>
): Promise<AsyncActionResponse<Res, Req, ErrorResult>> => {
	const beforeSendResult = await beforeSendResolver<Res, Req, ErrorResult>(args);
	if (beforeSendResult) return beforeSendResult;

	let response: Res;
	try {
		response = await action();
	} catch (err) {
		const result = { error: prepareError<Req, ErrorResult>(err), response: args?.fallbackResponse as Res, success: false };
		await args?.onError?.(result as AsyncActionResponse<never, Req, ErrorResult>);
		return result;
	}
	const result = { response, success: true };
	await args?.onSuccess?.(result);
	return result;
};

export const createAsyncResource = async <Res = never, Req = never, ErrorResult extends object = Record<never, never>>(
	action: Action<Res>,
	args?: AsyncResourceSettings<Res, Req, ErrorResult>
): Promise<Res> => {
	const result = await createAsyncAction<Res, Req, ErrorResult>(action, args);
	if (!result.success && args?.reject) {
		throw result.error;
	}
	return result.response;
};
