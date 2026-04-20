import { BaseHttpDatasource, type CreateRequestCallbackType } from '$lib/core/infra/index.js';
import { MockApiResponse } from '../responses/index.js';

export class MockApiDatasource extends BaseHttpDatasource {
	async createRequest<T>(callback: CreateRequestCallbackType<T>) {
		return new MockApiResponse<T>(await this.createRawRequest<T>(callback));
	}
}
