import { describe, expect, it } from 'vitest';
import { RequestContext } from '@azure-net/edges/context';
import { createHttpServiceInstance } from '../../src/lib/infra/http-service/HttpServiceInstance.js';

describe('HttpServiceInstance integration', () => {
	it('calls external fake-api route and parses payload', async () => {
		RequestContext.init(
			() =>
				({
					event: {
						fetch,
						url: new URL('https://integration.local/current')
					}
				}) as never
		);

		const instance = createHttpServiceInstance({ timeout: 15000 });
		const result = await instance.get<unknown[]>('https://cb784374e7b649a4b5ced37b17042896.fake-api.io/public-route');

		expect(result.success).toBe(true);
		expect(Array.isArray(result.data)).toBe(true);
		expect((result.data as unknown[]).length).toBeGreaterThan(0);
	});
});
