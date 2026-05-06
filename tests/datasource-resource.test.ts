import { describe, expect, it } from 'vitest';
import { BaseHttpDatasource } from '../src/lib/infra/datasource/BaseDatasource.js';
import { HttpServiceResponse } from '../src/lib/infra/http-service/HttpServiceInstance.js';
import { DTOMapper } from '../src/lib/infra/resource/BaseResource.js';

class UserDTO extends DTOMapper {
	id = 1;
	name = 'John';
	fullName() {
		return `${this.id}-${this.name}`;
	}
}

describe('BaseHttpDatasource and DTOMapper', () => {
	it('createRawRequest resolves callback result', async () => {
		const datasource = new BaseHttpDatasource({});
		const result = await datasource.createRawRequest(async () => {
			return new HttpServiceResponse({
				headers: { a: '1' },
				status: 200,
				success: true,
				data: { ok: true },
				message: 'ok'
			});
		});

		expect(result.data).toEqual({ ok: true });
		expect(result.status).toBe(200);
	});

	it('createRawRequest rethrows HttpServiceError', async () => {
		const datasource = new BaseHttpDatasource({});
		await expect(
			datasource.createRawRequest(async () => {
				throw new Error('network');
			})
		).rejects.toThrow('network');
	});

	it('DTOMapper.toPlainObject excludes methods', () => {
		const dto = new UserDTO();
		expect(dto.toPlainObject()).toEqual({ id: 1, name: 'John' });
	});
});
