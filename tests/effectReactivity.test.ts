// @vitest-environment jsdom

import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import EffectHarness from './fixtures/EffectHarness.svelte';

describe('createEffect', () => {
	it('runs initially and only reacts to explicit dependencies', async () => {
		const callback = vi.fn((state: { ignored: number }) => {
			void state.ignored;
		});
		let state!: { watched: number; ignored: number };
		const view = render(EffectHarness, {
			onRun: callback,
			expose: (value) => {
				state = value;
			}
		});

		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		state.ignored = 1;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);

		state.watched = 1;
		await tick();
		expect(callback).toHaveBeenCalledTimes(2);
		view.unmount();
	});

	it('uses Object.is for dependency values', async () => {
		const callback = vi.fn();
		let state!: { source: number };
		const view = render(EffectHarness, {
			mode: 'projected',
			onRun: callback,
			expose: (value) => {
				state = value;
			}
		});

		await tick();
		state.source = 2;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);

		state.source = 3;
		await tick();
		expect(callback).toHaveBeenCalledTimes(2);
		view.unmount();
	});

	it('runs cleanup before a changed callback and on destroy', async () => {
		const cleanup = vi.fn();
		const callback = vi.fn(() => cleanup);
		let state!: { watched: number };
		const view = render(EffectHarness, {
			onRun: callback,
			expose: (value) => {
				state = value;
			}
		});

		await tick();
		state.watched = 1;
		await tick();
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledTimes(2);

		view.unmount();
		expect(cleanup).toHaveBeenCalledTimes(2);
	});

	it('runs only once with an empty dependency list', async () => {
		const callback = vi.fn();
		let state!: { watched: number; ignored: number };
		const view = render(EffectHarness, {
			mode: 'empty',
			onRun: callback,
			expose: (value) => {
				state = value;
			}
		});

		await tick();
		state.watched = 1;
		state.ignored = 1;
		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('accepts an async callback without treating its promise as cleanup', async () => {
		const callback = vi.fn(async () => undefined);
		const view = render(EffectHarness, {
			onRun: callback,
			expose: () => undefined
		});

		await tick();
		expect(callback).toHaveBeenCalledTimes(1);
		expect(() => view.unmount()).not.toThrow();
	});
});
