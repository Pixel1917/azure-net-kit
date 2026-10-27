import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { AsyncSignalSvelte } from '../../src/lib/svelte/async-signal/AsyncSignal.svelte.js';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const output = mkdtempSync(path.join(tmpdir(), 'async-signal-'));
beforeAll(() => {
	execFileSync(process.execPath, ['tests/fixtures/async-signal/build.mjs', output], { stdio: 'pipe' });
}, 60_000);
afterAll(() => rmSync(output, { recursive: true, force: true }));

it.each([
	[false, false],
	[true, false],
	[false, true],
	[true, true]
])(
	'reuses real SSR data/errors during hydration (request failure: %s, callback failure: %s), then refreshes normally',
	async (failure, callbackFailure) => {
		const { render, Component } = await import(/* @vite-ignore */ pathToFileURL(path.join(output, 'server/entry.mjs')).href);
		const serverRequest = vi.fn(async () => {
			if (failure) throw new Error('server failure');
			return 'server data';
		});
		const serverBefore = vi.fn(async () => {});
		const serverSuccess = vi.fn();
		if (callbackFailure && !failure)
			serverSuccess.mockImplementationOnce(() => {
				throw new Error('callback failure');
			});
		const serverError = vi.fn();
		if (callbackFailure && failure)
			serverError.mockImplementationOnce(() => {
				throw new Error('error callback failure');
			});
		let serverSignal!: AsyncSignalSvelte<string>;
		const { head, body } = await render(Component, {
			props: {
				user: 'alice',
				request: serverRequest,
				expose: (value: AsyncSignalSvelte<string>) => {
					serverSignal = value;
				},
				beforeSend: serverBefore,
				onSuccess: serverSuccess,
				onError: serverError
			}
		});
		expect(serverRequest).toHaveBeenCalledTimes(1);
		expect(serverBefore).toHaveBeenCalledTimes(1);
		expect(body).toContain(failure ? 'server failure' : 'server data');
		expect(serverSignal.status).toBe(failure || callbackFailure ? 'error' : 'success');
		expect(failure || callbackFailure ? serverError : serverSuccess).toHaveBeenCalledTimes(1);

		const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`, {
			runScripts: 'dangerously',
			url: 'http://localhost'
		});
		try {
			dom.window.eval(readFileSync(path.join(output, 'client/entry.js'), 'utf8'));
			const client = dom.window.AsyncSignalFixture;
			let signal!: AsyncSignalSvelte<string>;
			const request = vi.fn(async () => 'client data');
			const beforeSend = vi.fn();
			const onSuccess = vi.fn();
			if (callbackFailure && !failure)
				onSuccess.mockImplementationOnce(() => {
					throw new Error('callback failure');
				});
			const onError = vi.fn();
			if (callbackFailure && failure)
				onError.mockImplementationOnce(() => {
					throw new Error('error callback failure');
				});
			client.hydrate(client.Component, {
				target: dom.window.document.body,
				props: {
					user: 'alice',
					request,
					expose: (value: AsyncSignalSvelte<string>) => {
						signal = value;
					},
					beforeSend,
					onSuccess,
					onError
				}
			});
			await client.settled();
			expect(request).not.toHaveBeenCalled();
			expect(beforeSend).not.toHaveBeenCalled();
			expect(failure || callbackFailure ? onError : onSuccess).toHaveBeenCalledTimes(1);
			expect(signal.status).toBe(failure || callbackFailure ? 'error' : 'success');
			await expect(signal.ready).resolves.toBe(failure ? undefined : 'server data');
			await signal.refresh();
			await client.settled();
			expect(request).toHaveBeenCalledTimes(1);
			expect(beforeSend).toHaveBeenCalledTimes(1);
			expect(signal.response).toBe('client data');
			expect(dom.window.document.body.textContent).toContain('client data');
			await client.refreshAsyncSignal('user');
			expect(request).toHaveBeenCalledTimes(2);
		} finally {
			dom.window.close();
		}
	}
);

it('isolates concurrent SSR renders using the same stable key', async () => {
	const { render, Component } = await import(/* @vite-ignore */ pathToFileURL(path.join(output, 'server/entry.mjs')).href);
	const results = await Promise.all(
		['alice', 'bob'].map((user) =>
			render(Component, {
				props: {
					user,
					request: async () => {
						await new Promise((resolve) => setTimeout(resolve, 5));
						return `${user}-private`;
					},
					expose: () => {},
					beforeSend: () => {},
					onSuccess: () => {},
					onError: () => {}
				}
			})
		)
	);
	expect(results[0].body).toContain('alice-private');
	expect(results[0].head).not.toContain('bob-private');
	expect(results[1].body).toContain('bob-private');
	expect(results[1].head).not.toContain('alice-private');
});

it('unmounts while the initial hydrated callback is pending without retaining a global refresh registration', async () => {
	const { render, Component } = await import(/* @vite-ignore */ pathToFileURL(path.join(output, 'server/entry.mjs')).href);
	const { head, body } = await render(Component, {
		props: {
			user: 'alice',
			request: async () => 'server data',
			expose: () => {},
			beforeSend: () => {},
			onSuccess: () => {},
			onError: () => {}
		}
	});
	const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`, {
		runScripts: 'dangerously',
		url: 'http://localhost'
	});
	let release!: () => void;
	const callbackGate = new Promise<void>((resolve) => {
		release = resolve;
	});
	try {
		dom.window.eval(readFileSync(path.join(output, 'client/entry.js'), 'utf8'));
		const client = dom.window.AsyncSignalFixture;
		const request = vi.fn(async () => 'client data');
		const expose = vi.fn();
		const onSuccess = vi.fn(() => callbackGate);
		const component = client.hydrate(client.Component, {
			target: dom.window.document.body,
			props: {
				user: 'alice',
				request,
				expose,
				beforeSend: () => {},
				onSuccess,
				onError: () => {}
			}
		});
		await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
		expect(expose).not.toHaveBeenCalled();
		await client.unmount(component);
		release();
		await client.settled();
		await client.refreshAsyncSignal('user');
		expect(request).not.toHaveBeenCalled();
		expect(dom.window.document.body.textContent).toBe('');
	} finally {
		release();
		dom.window.close();
	}
});
