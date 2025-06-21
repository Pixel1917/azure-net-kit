import { HttpServiceResponse } from '$lib/core/httpService/index.js';

export class BaseService {
	protected async transformResponse<TData extends object, TResult = TData, TKey extends keyof TData | undefined = undefined>(
		requestPromise: Promise<HttpServiceResponse<TData>>,
		options?: {
			responseModel?: { new (response: HttpServiceResponse<TData>): { json(): TResult } };
			key?: TKey;
		}
	): Promise<TKey extends keyof TData ? TData[TKey] : TResult> {
		const response = await requestPromise;

		if (options?.responseModel) {
			return new options.responseModel(response).json() as TKey extends keyof TData ? TData[TKey] : TResult;
		}

		if (options?.key) {
			return response.data[options.key] as TKey extends keyof TData ? TData[TKey] : TResult;
		}

		return response.data as TKey extends keyof TData ? TData[TKey] : TResult;
	}
}
