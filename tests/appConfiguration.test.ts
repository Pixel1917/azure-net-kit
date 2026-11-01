import { describe, expect, it, vi } from 'vitest';
import { createApp, type AppConfiguration } from '../src/lib/shared/app/index.js';
import { createTranslations } from '../src/lib/i18n/index.js';

const closedError = '[createApp] Configuration is closed. Register hooks synchronously inside createApp.';
const synchronousError = '[createApp] Configuration must be synchronous.';
const registrations = {
	useTranslations: (app: AppConfiguration) =>
		app.useTranslations(createTranslations({ messages: { en: async () => ({ title: 'Hello' }) }, initLang: 'en' })),
	useBoot: (app: AppConfiguration) => app.useBoot(() => {}),
	useClient: (app: AppConfiguration) => app.useClient(() => {}),
	useClientInit: (app: AppConfiguration) => app.useClientInit(() => {}),
	useClientError: (app: AppConfiguration) => app.useClientError(() => {}),
	useServerInit: (app: AppConfiguration) => app.useServerInit(() => {}),
	useServer: (app: AppConfiguration) => app.useServer(() => {}),
	useServerError: (app: AppConfiguration) => app.useServerError(() => {}),
	useServerFetch: (app: AppConfiguration) => app.useServerFetch(({ request, fetch }) => fetch(request)),
	useReroute: (app: AppConfiguration) => app.useReroute(() => undefined),
	useTransport: (app: AppConfiguration) => app.useTransport({})
} satisfies Record<keyof AppConfiguration, (app: AppConfiguration) => void>;

describe('imperative app configuration', () => {
	it.each(Object.entries(registrations))('%s returns undefined and rejects duplicate registration', (method, register) => {
		createApp((app) => {
			expect(register(app)).toBeUndefined();
			expect(() => register(app)).toThrow(`[createApp] '${method}' can be registered only once.`);
		});
	});

	it.each(Object.entries(registrations))('%s rejects registration through a saved reference after configuration', (_, register) => {
		let saved!: AppConfiguration;
		createApp((app) => {
			saved = app;
		});
		expect(() => register(saved)).toThrow(closedError);
	});

	it.each(Object.entries(registrations))('%s remains closed when configuration throws', (_, register) => {
		let saved!: AppConfiguration;
		const failure = new Error('configuration failed');
		expect(() =>
			createApp((app) => {
				saved = app;
				throw failure;
			})
		).toThrow(failure);
		expect(() => register(saved)).toThrow(closedError);
	});

	it('rejects a resolved async configuration and closes its saved reference', async () => {
		let saved!: AppConfiguration;
		expect(() =>
			createApp(async (app) => {
				saved = app;
				await Promise.resolve();
			})
		).toThrow(synchronousError);
		expect(() => saved.useClient(() => {})).toThrow(closedError);
		await new Promise<void>((resolve) => setImmediate(resolve));
	});

	it.each(['throw', 'late registration', 'thenable'] as const)('consumes rejected %s configuration without an unhandled rejection', async (kind) => {
		const unhandled = vi.fn();
		const failure = new Error('async configuration failed');
		const lateError = vi.fn();
		process.on('unhandledRejection', unhandled);
		try {
			expect(() =>
				createApp(
					kind === 'thenable'
						? () => ({ then: (_resolve: unknown, reject: (reason: unknown) => void) => reject(failure) })
						: async (app) => {
								await Promise.resolve();
								if (kind === 'late registration') {
									try {
										app.useServer(() => {});
									} catch (error) {
										lateError(error);
										throw error;
									}
								} else {
									throw failure;
								}
							}
				)
			).toThrow(synchronousError);
			await new Promise<void>((resolve) => setImmediate(resolve));
			if (kind === 'late registration') expect(lateError).toHaveBeenCalledWith(expect.objectContaining({ message: closedError }));
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off('unhandledRejection', unhandled);
		}
	});

	it('still awaits an async lifecycle registered synchronously', async () => {
		const calls: string[] = [];
		const { register } = createApp((app) => {
			app.useServerInit(async () => {
				await Promise.resolve();
				calls.push('initialized');
			});
		});
		await register.serverInit();
		expect(calls).toEqual(['initialized']);
	});
});
