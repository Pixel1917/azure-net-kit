import { describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ goto: vi.fn(() => Promise.resolve()), redirect: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('@sveltejs/kit', () => ({ redirect: mocks.redirect }));
import { useRedirect } from '../src/lib/svelte/redirect/index.js';
describe('Kit 3 redirect options', () => {
	it('forwards native goto options without legacy remapping', async () => {
		const options = { shallow: true, replace: true, reset: false, refreshAll: true, persistState: true, state: {} };
		await useRedirect('/profile', { type: 'client', clientRedirectSettings: options });
		expect(mocks.goto).toHaveBeenCalledExactlyOnceWith('/profile', options);
	});
	it('preserves server redirect status', () => {
		useRedirect('/login', { type: 'server', serverRedirectSettings: { status: 303 } });
		expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(303, '/login');
	});
});
