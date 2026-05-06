import { AppError, type IAppError } from '../../shared/app-error/AppError.js';
import { AppEvents } from '../../shared/event-bus/EventBus.js';
import type { AsyncHelperRetry } from './AsyncHelpers.js';

export type ErrorHandlerContext = {
	AppEvents: typeof AppEvents;
};

export const createErrorHandler = <CustomData extends object>(
	handle?: <T = unknown>(error: AppError<T>, asyncHelperRetry: AsyncHelperRetry, context: ErrorHandlerContext) => Promise<IAppError<T> & CustomData>
) => {
	return async <T = unknown>(error: Error, asyncHelperRetry?: AsyncHelperRetry): Promise<IAppError<T> & CustomData> => {
		const appError = new AppError<T>(error);
		if (handle) {
			const handled = await handle<T>(appError, asyncHelperRetry ?? { can: false }, { AppEvents });
			if (handled?.appErrorConvert) {
				return handled;
			}
			throw new Error('Method "handle" must return result of "toPlainObject" method in AppError');
		}
		return appError.toPlainObject<CustomData>();
	};
};
