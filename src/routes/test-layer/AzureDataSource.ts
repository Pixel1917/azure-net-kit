import { BaseHttpDatasource, type IHttpDatasource } from '$lib/core/datasource/index.js';
import { HttpService, HttpServiceError, HttpServiceResponse } from '$lib/core/httpService/index.js';
import { browser } from '$app/environment';
import { RequestContext } from 'edges-svelte/context';
import { Cookies } from 'azure-net-tools';
import { QueryBuilder } from '$lib/index.js';

export interface IBackendApiDataSourceResponse<T = unknown> {
	data: T;
	success: boolean;
	message: string;
}

export class AzureNetRestDatasource extends BaseHttpDatasource implements IHttpDatasource {
	constructor() {
		super({
			http: new HttpService({
				baseUrl: `https://api-laravel.azure-net.ru/back`,
				requestHandler: (options) => {
					const token = !browser ? RequestContext.current()?.event?.cookies?.get('token') : Cookies.get('token');
					if (token) {
						options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
					}
				}
			})
		});
	}

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
