import { describe, expect, it } from 'vitest';
import {
	createErrorParser,
	baseParseBaseError,
	baseParseHttpError,
	baseParseSchemaError
} from '../src/lib/core/delivery/injectableDependencies/ErrorHandler.js';
import { HttpServiceError } from '../src/lib/core/infra/httpService/HttpServiceInstance.js';
import { SchemaFail } from '../src/lib/core/delivery/schema/Schema.js';

describe('ErrorHandler', () => {
	it('baseParseHttpError maps http error to app error without leaking original', async () => {
		const httpError = new HttpServiceError({
			data: { reason: 'bad request' },
			status: 400,
			headers: {},
			success: false,
			message: 'Request failed'
		});

		const parsed = await baseParseHttpError(httpError, async () => undefined);
		expect(parsed.type).toBe('http');
		expect(parsed.status).toBe(400);
		expect(parsed.original).toBeUndefined();
		expect(parsed.retry).toBeUndefined();
	});

	it('baseParseSchemaError includes fields and strips original', async () => {
		const schemaError = new SchemaFail<Record<string, unknown>>({ name: 'required' } as never);
		const parsed = await baseParseSchemaError(schemaError);

		expect(parsed.type).toBe('schema');
		expect(parsed.status).toBe(422);
		expect(parsed.fields).toEqual({ name: 'required' });
		expect(parsed.original).toBeUndefined();
	});

	it('baseParseBaseError maps generic error', async () => {
		const parsed = await baseParseBaseError(new Error('Boom'));
		expect(parsed.type).toBe('app');
		expect(parsed.message).toBe('Boom');
	});

	it('createErrorParser routes by error type', async () => {
		const parser = createErrorParser();

		const httpResult = await parser(new HttpServiceError({ data: null, status: 500, headers: {}, success: false, message: 'Http boom' }));
		expect(httpResult.type).toBe('http');

		const schemaResult = await parser(new SchemaFail<Record<string, unknown>>({ field: 'invalid' } as never));
		expect(schemaResult.type).toBe('schema');

		const baseResult = await parser(new Error('Generic'));
		expect(baseResult.type).toBe('app');
	});
});
