import { expect, it } from 'vitest';
import { setImmediate } from 'node:timers/promises';
import { RequestContext } from '../src/lib/shared/request-context/Internal.js';
import { runRequest } from '../src/lib/server/Context/Runtime.js';

async function collect() {
	if (!globalThis.gc) throw new Error('Run with --expose-gc');
	for (let i = 0; i < 5; i++) {
		await setImmediate();
		globalThis.gc();
	}
}

it('cached promises do not retain completed requests, including abandoned responses', async () => {
	const cached: Promise<unknown>[] = [];
	const refs: WeakRef<object>[] = [];
	async function request(stream: boolean) {
		await runRequest({} as never, async () => {
			const context = RequestContext.current();
			refs.push(new WeakRef(context), new WeakRef(context.event));
			cached.push(Promise.resolve('cached-module'));
			return stream ? new Response(new ReadableStream({ pull() {} })) : undefined;
		});
	}
	await request(false);
	await request(true);
	await collect();
	expect(refs.every((ref) => ref.deref() === undefined)).toBe(true);
	expect(await Promise.all(cached)).toEqual(['cached-module', 'cached-module']);
});

it('keeps pending callbacks alive across GC', async () => {
	let resume!: () => void;
	const gate = new Promise<void>((resolve) => (resume = resolve));
	const pending = runRequest({} as never, async () => {
		RequestContext.current().state.testId = 'pending';
		await gate;
		return RequestContext.current().state.testId;
	});
	await collect();
	resume();
	expect(await pending).toBe('pending');
});

it('keeps streaming callbacks alive until cancellation and releases them afterwards', async () => {
	let ref!: WeakRef<object>;
	const cached: Promise<unknown>[] = [];
	const response = runRequest({} as never, () => {
		RequestContext.current().state.testId = 'streaming';
		ref = new WeakRef(RequestContext.current());
		cached.push(Promise.resolve('module'));
		return new Response(
			new ReadableStream({
				pull(controller) {
					controller.enqueue(new TextEncoder().encode(RequestContext.current().state.testId));
				},
				cancel() {
					expect(RequestContext.current().state.testId).toBe('streaming');
				}
			})
		);
	});
	await collect();
	expect(ref.deref()).toBeDefined();
	const reader = response.body!.getReader();
	expect(new TextDecoder().decode((await reader.read()).value)).toBe('streaming');
	await reader.cancel();
	await collect();
	expect(ref.deref()).toBeUndefined();
	expect(await cached[0]).toBe('module');
});

it.each(['close', 'error'] as const)('releases streaming contexts after %s', async (completion) => {
	let ref!: WeakRef<object>;
	let end!: () => void;
	const response = runRequest({} as never, () => {
		ref = new WeakRef(RequestContext.current());
		return new Response(
			new ReadableStream({
				start(controller) {
					end = () => (completion === 'close' ? controller.close() : controller.error(new Error('stream failed')));
				}
			})
		);
	});
	await collect();
	expect(ref.deref()).toBeDefined();
	const body = response.text();
	end();
	if (completion === 'close') expect(await body).toBe('');
	else await expect(body).rejects.toThrow('stream failed');
	await collect();
	expect(ref.deref()).toBeUndefined();
});
