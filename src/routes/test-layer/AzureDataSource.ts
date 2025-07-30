import { BaseHttpDatasource } from '$lib/core/datasource/index.js';
import { HttpService, HttpServiceError, HttpServiceResponse } from '$lib/core/httpService/index.js';
import { QueryBuilder } from '$lib/index.js';

export interface IBackendApiDataSourceResponse<T = unknown> {
	data: T;
	success: boolean;
	message: string;
}

export class AzureNetRestDatasource extends BaseHttpDatasource {
	override async createRequest<T, D = Record<keyof T, string>>(
		callback: (params: { http: HttpService; query: QueryBuilder }) => Promise<HttpServiceResponse<IBackendApiDataSourceResponse<T>>>
	) {
		return await callback({ http: this.httpClient, query: this.query })
			.then((response) => {
				return new HttpServiceResponse<T>({
					...response,
					success: response?.data?.success ?? response.success,
					data: response?.data?.data,
					message: response?.data?.message ?? response.message
				});
			})
			.catch((error: HttpServiceError<IBackendApiDataSourceResponse<D>>) => {
				throw new HttpServiceError<D>({
					...error,
					message: error.data.message ?? error.message,
					data: error?.data?.data,
					success: error.data.success ?? error.success
				});
			});
	}
}
