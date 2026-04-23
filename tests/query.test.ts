import { describe, expect, it } from 'vitest';
import { createQuery } from '../src/lib/core/svelte/Query/Query.svelte.js';

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
});
