import { describe, expect, it } from 'vitest';
import { fromSearchParams, toSearchParams } from '../src/lib/svelte/query/SearchParamsSync.js';

describe('query search params codec', () => {
	it('parses supported scalar, collection and object values from declared types', () => {
		const initial = {
			search: '',
			page: 1,
			enabled: false,
			identifier: 1n,
			createdAt: new Date('2025-01-01T00:00:00.000Z'),
			endpoint: new URL('https://azure-net.dev/default'),
			nestedParams: new URLSearchParams('initial=true'),
			tags: [] as string[],
			ids: [0],
			filters: { category: '' },
			optional: undefined
		};
		const params = new URLSearchParams();
		params.set('search', 'azure');
		params.set('page', '5');
		params.set('enabled', '1');
		params.set('identifier', '42');
		params.set('createdAt', '2026-08-15T10:00:00.000Z');
		params.set('endpoint', '/kit');
		params.set('nestedParams', 'page=2&active=true');
		params.append('tags', 'svelte');
		params.append('tags', 'kit');
		params.append('ids', '10');
		params.append('ids', '20');
		params.set('filters', '{"category":"books"}');
		params.set('optional', 'ignored');
		params.set('unknown', 'ignored');

		expect(fromSearchParams(params, initial)).toEqual({
			search: 'azure',
			page: 5,
			enabled: true,
			identifier: 42n,
			createdAt: new Date('2026-08-15T10:00:00.000Z'),
			endpoint: new URL('https://azure-net.dev/kit'),
			nestedParams: new URLSearchParams('page=2&active=true'),
			tags: ['svelte', 'kit'],
			ids: [10, 20],
			filters: { category: 'books' }
		});
	});

	it('ignores invalid values instead of corrupting query types', () => {
		const initial = {
			page: 1,
			enabled: false,
			identifier: 1n,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			ids: [0],
			filters: { category: '' }
		};

		expect(fromSearchParams(new URLSearchParams('page=&enabled=yes&identifier=&createdAt=nope&ids=1&ids=nope&filters=%5B%5D'), initial)).toEqual({});
	});

	it('serializes supported values and repeated array entries', () => {
		const params = toSearchParams({
			search: 'azure net',
			page: 2,
			enabled: false,
			identifier: 42n,
			createdAt: new Date('2026-08-15T10:00:00.000Z'),
			endpoint: new URL('https://azure-net.dev/kit'),
			tags: ['svelte', 'kit'],
			filters: { category: 'books' },
			optional: undefined,
			invalidNumber: Number.NaN
		});

		expect(params.get('search')).toBe('azure net');
		expect(params.get('page')).toBe('2');
		expect(params.get('enabled')).toBe('false');
		expect(params.get('identifier')).toBe('42');
		expect(params.get('createdAt')).toBe('2026-08-15T10:00:00.000Z');
		expect(params.get('endpoint')).toBe('https://azure-net.dev/kit');
		expect(params.getAll('tags')).toEqual(['svelte', 'kit']);
		expect(params.get('filters')).toBe('{"category":"books"}');
		expect(params.has('optional')).toBe(false);
		expect(params.has('invalidNumber')).toBe(false);
	});
});
