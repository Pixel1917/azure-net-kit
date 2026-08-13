import { describe, expect, it, vi } from 'vitest';
import { BackgroundTask } from '../src/lib/shared/background-task/index.js';

describe('BackgroundTask', () => {
	it('starts immediately and is awaitable', async () => {
		const calls: string[] = [];
		const task = BackgroundTask.run(() => {
			calls.push('started');
			return 42;
		});

		expect(calls).toEqual(['started']);
		await expect(task).resolves.toBe(42);
	});

	it('registers its promise in function and object waitUntil targets', async () => {
		const functionTarget = vi.fn<(promise: Promise<unknown>) => void>();
		const objectTarget = { waitUntil: vi.fn<(promise: Promise<unknown>) => void>() };
		const task = BackgroundTask.run(async () => 'ready');

		expect(task.waitUntil(functionTarget)).toBe(task);
		expect(task.waitUntil(objectTarget)).toBe(task);
		expect(functionTarget).toHaveBeenCalledTimes(1);
		expect(objectTarget.waitUntil).toHaveBeenCalledTimes(1);
		await expect(functionTarget.mock.calls[0][0]).resolves.toBe('ready');
		await expect(objectTarget.waitUntil.mock.calls[0][0]).resolves.toBe('ready');
	});

	it('exposes promise catch and finally without an unhandled rejection', async () => {
		const error = new Error('failed');
		const finalized = vi.fn();
		const task = BackgroundTask.run(() => {
			throw error;
		});

		await expect(task.catch((reason) => reason)).resolves.toBe(error);
		await expect(task.finally(finalized)).rejects.toBe(error);
		expect(finalized).toHaveBeenCalledTimes(1);
	});
});
