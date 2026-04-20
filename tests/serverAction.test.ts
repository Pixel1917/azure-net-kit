import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@azure-net/edges/context';
import { EnvironmentUtil } from '@azure-net/tools';
import { createServerAction, createServerActionFactory } from '../src/lib/core/delivery/serverAction/CreateServerAction.js';

describe('createServerAction', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('injects context, utils and custom dependencies on server', () => {
		const event = { locals: { userId: 7 } } as never;
		RequestContext.init(() => ({ event, data: {} as never }));

		const action = createServerAction(
			({ context, utils, token }) => ({
				context,
				hasFail: typeof utils.fail === 'function',
				token
			}),
			{ token: 'abc' }
		);

		const result = action();
		expect(result.context).toBe(event);
		expect(result.hasFail).toBe(true);
		expect(result.token).toBe('abc');
	});

	it('supports reusable createServerActionFactory injections', () => {
		const event = { request: { method: 'POST' } } as never;
		RequestContext.init(() => ({ event, data: {} as never }));

		const createWithAuth = createServerActionFactory({ role: 'admin' as const });
		const action = createWithAuth(({ role, context }) => ({ role, context }));
		const result = action();

		expect(result.role).toBe('admin');
		expect(result.context).toBe(event);
	});

	it('throws on client-side usage', () => {
		vi.spyOn(EnvironmentUtil, 'isBrowser', 'get').mockReturnValue(true);
		const action = createServerAction(() => ({ ok: true }));
		expect(() => action()).toThrow('Do not use actions on client side');
	});
});
