import { ResponseBuilder } from '$lib/core/infra/index.js';

export interface IBackendApiDataSourceResponse<T = unknown> {
	data: T;
	success: boolean;
	message: string;
}

export class AzureNetApiResponse<TData = unknown, TMeta = unknown> extends ResponseBuilder<TData, TMeta, IBackendApiDataSourceResponse<TData>> {
	override unwrapData(data: IBackendApiDataSourceResponse<TData>): TData {
		return data.data;
	}

	paginate() {
		return this.addMeta({ page: Number(this.response.headers.page), total: Number(this.response.headers.total) });
	}
}
