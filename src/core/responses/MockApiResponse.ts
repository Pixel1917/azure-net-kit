import { ResponseBuilder } from '$lib/core/infra/index.js';
export class MockApiResponse<TData = unknown, TMeta = unknown> extends ResponseBuilder<TData, TMeta> {
	countElementsAndAddToMeta() {
		return this.addMeta({
			count: Array.isArray(this.response.data) ? this.response.data.length : undefined
		});
	}
}
