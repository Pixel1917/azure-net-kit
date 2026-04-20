import { describe, expect, it } from 'vitest';
import { HttpServiceResponse } from '../src/lib/core/infra/httpService/HttpServiceInstance.js';
import { ResponseBuilder } from '../src/lib/core/infra/response/BaseResponse.js';

class UserResource {
	constructor(private readonly data: { id: number; name: string }) {}
	toPlainObject() {
		return { ...this.data, name: this.data.name.toUpperCase() };
	}
}

describe('ResponseBuilder', () => {
	it('maps single resource using class', () => {
		const response = new HttpServiceResponse({
			headers: {},
			status: 200,
			success: true,
			data: { id: 1, name: 'john' },
			message: 'ok'
		});

		const result = new ResponseBuilder<{ id: number; name: string }>(response).mapUsing(UserResource).getData();
		expect(result).toEqual({ id: 1, name: 'JOHN' });
	});

	it('maps collection using class', () => {
		const response = new HttpServiceResponse({
			headers: {},
			status: 200,
			success: true,
			data: [
				{ id: 1, name: 'john' },
				{ id: 2, name: 'kate' }
			],
			message: 'ok'
		});

		const result = new ResponseBuilder<{ id: number; name: string }[]>(response).mapCollectionUsing(UserResource).getData();
		expect(result).toEqual([
			{ id: 1, name: 'JOHN' },
			{ id: 2, name: 'KATE' }
		]);
	});

	it('throws on mapCollectionUsing for non-array data', () => {
		const response = new HttpServiceResponse({
			headers: {},
			status: 200,
			success: true,
			data: { id: 1, name: 'john' },
			message: 'ok'
		});

		expect(() => new ResponseBuilder<{ id: number; name: string }>(response).mapCollectionUsing(UserResource)).toThrow(
			'toCollection can only be used when data is an array'
		);
	});

	it('extracts deep paths and throws on missing path', () => {
		const response = new HttpServiceResponse({
			headers: {},
			status: 200,
			success: true,
			data: { user: { profile: { city: 'Moscow' } } },
			message: 'ok'
		});

		const builder = new ResponseBuilder<{ user: { profile: { city: string } } }>(response);
		expect(builder.extract('user.profile.city').getData()).toBe('Moscow');
		expect(() => builder.extract('user.profile.country' as 'user.profile.city')).toThrow('Path "user.profile.country" not found in response data');
	});

	it('merges metadata and supports flatten output', () => {
		const response = new HttpServiceResponse({
			headers: {},
			status: 200,
			success: true,
			data: { id: 1 },
			message: 'ok'
		});

		const result = new ResponseBuilder(response)
			.addMeta({ page: 1 })
			.addMeta((meta) => ({ total: (meta as { page: number }).page + 9 }))
			.getFlatten();

		expect(result).toEqual({ data: { id: 1 }, page: 1, total: 10 });
	});
});
