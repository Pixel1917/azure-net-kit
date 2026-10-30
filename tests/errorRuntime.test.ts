import { describe, expect, it } from 'vitest';
import { createAsyncAction as asyncAction } from '../src/lib/delivery/injectable-dependencies/AsyncHelpers.js';
import { HttpErrorTypes, HttpServiceError } from '../src/lib/infra/http-service/HttpServiceInstance.js';
import { SchemaFail } from '../src/lib/delivery/schema/Schema.js';

describe('local error conversion', () => {
	it('maps HttpServiceError through the default conversion', async () => {
		const createAsyncAction = asyncAction;
		const result = await createAsyncAction(async () => {
			throw new HttpServiceError({
				data: { reason: 'bad request' },
				status: 400,
				message: 'Request failed',
				type: HttpErrorTypes.External
			});
		});

		expect(result.error).toMatchObject({ type: 'Http', external: true, message: 'Request failed' });
	});

	it('maps SchemaFail validation through the default conversion', async () => {
		const createAsyncAction = asyncAction;
		const result = await createAsyncAction(async () => {
			throw new SchemaFail<Record<string, unknown>>({ name: 'required' } as never);
		});

		expect(result.error).toMatchObject({ type: 'Schema', validation: { name: 'required' } });
	});
});
