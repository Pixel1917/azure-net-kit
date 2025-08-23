import { BaseHttpDatasource, type CreateRequestCallbackType } from '$lib/core/infra/datasource/index.js';
import { ResponseBuilder } from '$lib/core/infra/response/index.js';

export interface IBackendApiDataSourceResponse<T = unknown> {
	data: T;
	meta: { page: number; total: number };
}

export class AzureNetApiResponse<TData = unknown, TMeta = unknown> extends ResponseBuilder<TData, TMeta, IBackendApiDataSourceResponse<TData>> {
	override unwrapData(data: IBackendApiDataSourceResponse<TData>): TData {
		return data.data;
	}

	paginate() {
		return this.addMeta({ page: Number(this.response.headers.page), total: Number(this.response.headers.total) });
	}
}

export class AzureNetRestDatasource extends BaseHttpDatasource {
	async createRequest<T>(callback: CreateRequestCallbackType<IBackendApiDataSourceResponse<T>>) {
		return new AzureNetApiResponse<T, unknown>(await this.createRawRequest<IBackendApiDataSourceResponse<T>>(callback));
	}
}
