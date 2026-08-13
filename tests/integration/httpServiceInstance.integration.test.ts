import { describe, expect, it } from 'vitest';
import { RequestContext } from '@azure-net/edges/context';
import { createHttpServiceInstance } from '../../src/lib/infra/http-service/HttpServiceInstance.js';

describe('HttpServiceInstance integration', () => {
	it('uses native fetch and parses a representative payload', async () => {
		const payload = Array.from({ length: 100 }, (_, id) => ({ id }));
		const url = `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
		RequestContext.init(
			() =>
				({
					event: {
						fetch,
						url: new URL('https://integration.local/current')
					}
				}) as never
		);

		const instance = createHttpServiceInstance({ timeout: 5000 });
		const result = await instance.get<Array<{ id: number }>>(url);

		expect(result.success).toBe(true);
		expect(result.data).toHaveLength(100);
		expect(result.data[99]).toEqual({ id: 99 });
		expect(result.headers['content-type']).toBe('application/json');
	});
});
