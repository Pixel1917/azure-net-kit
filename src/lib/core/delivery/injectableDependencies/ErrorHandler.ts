import { AppError, type IAppError } from '../../shared/appError/AppError.js';
import type { AsyncHelperRetry } from './AsyncHelpers.js';

export const createErrorHandler = <CustomData extends object>(
	handle?: <T = unknown>(error: AppError<T>, asyncHelperRetry: AsyncHelperRetry) => Promise<IAppError<T> & CustomData>
) => {
	return async <T = unknown>(error: Error, asyncHelperRetry?: AsyncHelperRetry): Promise<IAppError<T> & CustomData> => {
		const appError = new AppError<T>(error);
		if (handle) {
			const handled = await handle<T>(appError, asyncHelperRetry ?? { can: false });
			if (handled?.appErrorConvert) {
				return handled;
			}
			throw new Error('Method "handle" must return result of "toPlainObject" method in AppError');
		}
		return appError.toPlainObject<CustomData>();
	};
};
