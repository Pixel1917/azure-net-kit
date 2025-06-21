import { BaseDatasource, type IDatasource } from '$lib/core/datasource/index.js';
import { HttpService, HttpServiceError, HttpServiceResponse } from '$lib/core/httpService/index.js';
import { browser } from '$app/environment';
import { RequestContext } from 'edges-svelte/context';
import { Cookies } from 'azure-net-tools';

export interface IBackendApiDataSourceResponse<T = unknown> {
	data: T;
	success: boolean;
	message: string;
}

export class AzureNetRestDatasource extends BaseDatasource implements IDatasource {
	constructor() {
		super(
			new HttpService({
				baseUrl: `https://api-laravel.azure-net.ru/back`,
				requestHandler: (options) => {
					const token = !browser ? RequestContext.current()?.event?.cookies?.get('token') : Cookies.get('token');
					if (token) {
						options.headers = { ...options.headers, Authorization: `Bearer ` };
					}
				}
			})
		);
	}

	override async createRequest<T, D = Record<keyof T, string>>(
		callback: (params: { http: HttpService }) => Promise<HttpServiceResponse<IBackendApiDataSourceResponse<T>>>
	) {
		return await callback({ http: this.httpClient })
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
