import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { initializeRequestContext } from '../src/lib/shared/request-context/Internal.js';
import { HttpServiceInstance, HttpServiceError } from '../src/lib/infra/http-service/HttpServiceInstance.js';

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
async function measure(name: string, run: () => unknown | Promise<unknown>, iterations = 3000) {
	for (let i = 0; i < 500; i++) await run();
	const samples: number[] = [];
	for (let round = 0; round < 5; round++) {
		const start = performance.now();
		for (let i = 0; i < iterations; i++) await run();
		samples.push((performance.now() - start) / iterations);
	}
	const result = { name, iterations, rounds: 5, medianMs: median(samples), minMs: Math.min(...samples), maxMs: Math.max(...samples) };
	console.info('[HTTP benchmark]', JSON.stringify(result));
	expect(result.medianMs).toBeLessThan(1);
	return result;
}

describe('HTTP overhead benchmark (in-memory fetch, no network)', () => {
	it('measures construction, fetch baseline, success path and bounded retry', async () => {
		const fetcher = async () => new Response('{"value":1}', { headers: { 'content-type': 'application/json' } });
		initializeRequestContext(() => ({ event: { fetch: fetcher } }) as never);
		await measure('construct', () => new HttpServiceInstance());
		await measure('fetch + json baseline', async () => {
			const response = await fetcher();
			await response.json();
		});
		const noTimeout = new HttpServiceInstance({ timeout: false });
		await measure('client JSON, timeout disabled', () => noTimeout.get('/data'));
		const defaults = new HttpServiceInstance();
		await measure('client JSON, default timeout', () => defaults.get('/data'));
		const custom = new HttpServiceInstance({
			timeout: false,
			doFetch: async <T>() => ({ headers: {}, data: 1 as T, status: 200, success: true, message: 'ok' })
		});
		await measure('custom transport, timeout disabled', () => custom.get('/data'));
		const error = new HttpServiceError({ status: 401 });
		const retry = new HttpServiceInstance({
			timeout: false,
			doFetch: async () => {
				throw error;
			},
			retry: { limit: 1, shouldRetry: () => true }
		});
		await measure('failure + one retry', () => retry.get('/data').catch(() => {}), 1000);
	});
});
