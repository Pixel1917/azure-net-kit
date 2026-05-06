import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../src/lib/delivery/injectable-dependencies/ErrorHandler.js';
import { HttpErrorTypes, HttpServiceError } from '../src/lib/infra/http-service/HttpServiceInstance.js';
import { SchemaFail } from '../src/lib/delivery/schema/Schema.js';

describe('ErrorHandler', () => {
	it('default handler maps http error to app error', async () => {
		const parse = createErrorHandler();
		const httpError = new HttpServiceError({
			data: { reason: 'bad request' },
			status: 400,
			message: 'Request failed',
			type: HttpErrorTypes.External
		});

		const parsed = await parse(httpError);
		expect(parsed.type).toBe('Http');
		expect(parsed.external).toBe(true);
		expect(parsed.validation).toBeUndefined();
	});

	it('default handler maps schema error to validation payload', async () => {
		const parse = createErrorHandler();
		const schemaError = new SchemaFail<Record<string, unknown>>({ name: 'required' } as never);
		const parsed = await parse(schemaError);

		expect(parsed.type).toBe('Schema');
		expect(parsed.validation).toEqual({ name: 'required' });
	});

	it('default handler maps generic error to Unknown', async () => {
		const parse = createErrorHandler();
		const parsed = await parse(new Error('Boom'));
		expect(parsed.type).toBe('Unknown');
		expect(parsed.message).toBe('Boom');
	});

	it('custom handler receives retry metadata and must return appErrorConvert payload', async () => {
		const parser = createErrorHandler<{ code: string }>(async (appError, retry, context) => {
			expect(retry.can).toBe(true);
			expect(typeof retry.call).toBe('function');
			expect(typeof context.AppEvents).toBe('function');
			return appError.toPlainObject({ code: 'E_CUSTOM' }) as never;
		});

		const httpResult = await parser(new HttpServiceError({ data: null, status: 500, message: 'Http boom' }), {
			can: true,
			call: async () => undefined
		});
		expect(httpResult.type).toBe('Http');
		expect(httpResult.code).toBe('E_CUSTOM');
	});
});
