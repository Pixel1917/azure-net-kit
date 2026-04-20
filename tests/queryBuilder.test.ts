import { describe, expect, it } from 'vitest';
import { createQueryInstance } from '../src/lib/core/infra/query/QueryBuilder.js';

describe('createQueryInstance base behavior', () => {
	it('builds repeat arrays by default', () => {
		const query = createQueryInstance();
		expect(query.toString({ tags: ['a', 'b'] })).toBe('?tags=a&tags=b');
	});

	it('supports delimiter=false', () => {
		const query = createQueryInstance();
		expect(query.toString({ q: 'abc' }, { delimiter: false })).toBe('q=abc');
	});

	it('encodes nested objects as JSON in default object format', () => {
		const query = createQueryInstance();
		expect(query.toString({ filter: { status: 'active' } })).toBe('?filter=%7B%22status%22%3A%22active%22%7D');
	});

	it('supports nested-brackets object format', () => {
		const query = createQueryInstance({ objectFormat: 'nested-brackets' });
		const result = query.toString({ filter: { status: 'active', page: 2 } });
		expect(result).toContain('filter%5Bstatus%5D=active');
		expect(result).toContain('filter%5Bpage%5D=2');
	});

	it('supports array formats brackets/comma/json', () => {
		const query = createQueryInstance();
		expect(query.toString({ ids: [1, 2] }, { arrayFormat: 'brackets' })).toBe('?ids%5B%5D=1&ids%5B%5D=2');
		expect(query.toString({ ids: [1, 2] }, { arrayFormat: 'comma' })).toBe('?ids=1%2C2');
		expect(query.toString({ ids: [1, 2] }, { arrayFormat: 'json' })).toBe('?ids=%5B%221%22%2C%222%22%5D');
	});

	it('skips null and undefined values', () => {
		const query = createQueryInstance();
		expect(query.toString({ a: 1, b: null, c: undefined, d: 'ok' })).toBe('?a=1&d=ok');
	});
});

describe('createQueryInstance', () => {
	it('applies defaults and optional overrides', () => {
		const instance = createQueryInstance({
			delimiter: false,
			arrayFormat: 'brackets'
		});

		expect(instance.toString({ ids: [1, 2] })).toBe('ids%5B%5D=1&ids%5B%5D=2');
		expect(instance.toString({ ids: [1, 2] }, { delimiter: true, arrayFormat: 'repeat' })).toBe('?ids=1&ids=2');
	});

	it('supports transform in defaults and per-call override', () => {
		const instance = createQueryInstance<{ page: number; search: string }>({
			transform: (input) => ({
				page: input.page,
				q: input.search.trim()
			})
		});

		expect(instance.toString({ page: 2, search: '  hello  ' })).toBe('?page=2&q=hello');
		expect(
			instance.toString(
				{ page: 2, search: '  hello  ' },
				{
					transform: (input) => ({
						p: input.page
					})
				}
			)
		).toBe('?p=2');
	});

	it('returns URLSearchParams ready for HttpService searchParams', () => {
		const instance = createQueryInstance({
			arrayFormat: 'repeat',
			objectFormat: 'nested-brackets'
		});
		const params = instance.toSearchParams({
			ids: [1, 2],
			filter: {
				status: 'active'
			}
		});

		expect(params.getAll('ids')).toEqual(['1', '2']);
		expect(params.get('filter[status]')).toBe('active');
	});
});
