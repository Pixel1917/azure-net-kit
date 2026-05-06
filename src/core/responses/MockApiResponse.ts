import { ResponseBuilder } from '$lib/infra.js';
export class MockApiResponse<TData = unknown, TMeta = unknown> extends ResponseBuilder<TData, TMeta> {
	countElementsAndAddToMeta() {
		return this.addMeta({
			count: Array.isArray(this.response.data) ? this.response.data.length : undefined
		});
	}
}
