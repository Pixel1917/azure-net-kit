import { describe, expect, it } from 'vitest';
import { createQuery } from '../src/lib/svelte/query/Query.svelte.js';
import { createStateValue } from './fixtures/stateValue.svelte.js';

describe('createQuery.patch', () => {
	it('merges only provided keys and keeps others unchanged', () => {
		const query = createQuery({
			page: 1,
			search: '',
			limit: 20
		});

		query.patch({ search: 'john' });

		expect(query.data).toEqual({
			page: 1,
			search: 'john',
			limit: 20
		});
	});

	it('applies multiple patches and reset restores initial state', () => {
		const query = createQuery({
			page: 1,
			search: '',
			limit: 20
		});

		query.patch({ page: 2 });
		query.patch({ limit: 50, search: 'alex' });

		expect(query.data).toEqual({
			page: 2,
			search: 'alex',
			limit: 50
		});

		query.reset();

		expect(query.data).toEqual({
			page: 1,
			search: '',
			limit: 20
		});
	});

	it('preserves rich values and keeps initial state isolated', () => {
		const cycle: { label: string; self?: unknown } = { label: 'root' };
		cycle.self = cycle;
		const blob = new Blob(['avatar'], { type: 'text/plain' });
		const file = new File(['avatar'], 'avatar.txt', { type: 'text/plain' });
		const source = {
			createdAt: new Date('2026-08-13T10:00:00.000Z'),
			pattern: /azure/gi,
			params: new URLSearchParams('page=1'),
			metadata: new Map([['nested', { enabled: true }]]),
			tags: new Set(['one', 'two']),
			bytes: new Uint8Array([1, 2, 3]),
			optional: undefined,
			blob,
			file,
			cycle
		};

		const query = createQuery(source);
		source.createdAt.setUTCFullYear(2000);
		source.metadata.get('nested')!.enabled = false;
		source.bytes[0] = 9;
		source.cycle.label = 'mutated';

		expect(query.data.createdAt).toBeInstanceOf(Date);
		expect(query.data.createdAt.toISOString()).toBe('2026-08-13T10:00:00.000Z');
		expect(query.data.pattern).toEqual(/azure/gi);
		expect(query.data.params).toBeInstanceOf(URLSearchParams);
		expect(query.data.params.get('page')).toBe('1');
		expect(query.data.metadata).toBeInstanceOf(Map);
		expect(query.data.metadata.get('nested')).toEqual({ enabled: true });
		expect(query.data.tags).toEqual(new Set(['one', 'two']));
		expect([...query.data.bytes]).toEqual([1, 2, 3]);
		expect(Object.hasOwn(query.data, 'optional')).toBe(true);
		expect(query.data.blob).toBe(blob);
		expect(query.data.file).toBe(file);
		expect(query.data.cycle.self).toBe(query.data.cycle);
		expect(query.data.cycle.label).toBe('root');

		const snapshot = query.snapshot();
		snapshot.metadata.get('nested')!.enabled = false;
		snapshot.bytes[1] = 9;
		expect(query.data.metadata.get('nested')!.enabled).toBe(true);
		expect([...query.data.bytes]).toEqual([1, 2, 3]);

		query.data.metadata.get('nested')!.enabled = false;
		query.reset();
		expect(query.data.metadata.get('nested')!.enabled).toBe(true);
	});

	it('accepts a Svelte state value without retaining its proxy graph', () => {
		const state = createStateValue({ nested: { value: 1 }, date: new Date('2026-01-01T00:00:00.000Z') });
		const query = createQuery(state);

		state.nested.value = 2;
		state.date.setUTCFullYear(2030);

		expect(query.data.nested.value).toBe(1);
		expect(query.data.date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
	});

	it('retains symbols, non-enumerable values and map graph identity', () => {
		const symbol = Symbol('metadata');
		const mapKey = { id: 1 };
		const source: Record<PropertyKey, unknown> = {
			map: new Map([[mapKey, { owner: mapKey }]])
		};
		source[symbol] = { enabled: true };
		Object.defineProperty(source, 'hidden', {
			configurable: true,
			enumerable: false,
			value: { count: 1 },
			writable: true
		});

		const query = createQuery(source);
		const clonedMapKey = [...(query.data.map as Map<object, { owner: object }>).keys()][0];

		expect(clonedMapKey).not.toBe(mapKey);
		expect((query.data.map as Map<object, { owner: object }>).get(clonedMapKey)?.owner).toBe(clonedMapKey);
		expect(query.data[symbol]).toEqual({ enabled: true });
		expect(query.data.hidden).toEqual({ count: 1 });
		expect(Object.keys(query.data)).not.toContain('hidden');
	});
});
