import { BaseHttpDatasource, type CreateRequestCallbackType } from '$lib/core/infra/index.js';
import { AzureNetApiResponse, type IBackendApiDataSourceResponse } from '../Response/index.js';

export class AzureNetRestDatasource extends BaseHttpDatasource {
	async createRequest<T>(callback: CreateRequestCallbackType<IBackendApiDataSourceResponse<T>>) {
		return new AzureNetApiResponse<T, unknown>(await this.createRawRequest<IBackendApiDataSourceResponse<T>>(callback));
	}
}
