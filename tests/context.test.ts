import { describe, expect, it } from 'vitest';
import { RequestContext } from '../src/lib/shared/request-context/Internal.js';
import { runRequest } from '../src/lib/server/Context/Runtime.js';
import { CreateServiceContainer } from '../src/lib/shared/boundary-provider/Provider.js';

describe('kit request context', () => {
	it('exposes only event and state and rejects access outside requests', () => {
		expect(() => RequestContext.current()).toThrow('No active RequestContext');
		const event = {} as never;
		runRequest(event, () => {
			expect(Object.keys(RequestContext.current())).toEqual(['event', 'state']);
			expect(RequestContext.current().event).toBe(event);
			expect(Object.isFrozen(RequestContext.current())).toBe(true);
			expect(RequestContext).not.toHaveProperty('init');
		});
		expect(() => RequestContext.current()).toThrow('No active RequestContext');
	});
	it('isolates interleaved requests and their DI instances', async () => {
		const di = CreateServiceContainer('context-test', { register: () => ({ User: () => ({ id: RequestContext.current().state.testId }) }) });
		await Promise.all(
			Array.from({ length: 80 }, (_, index) =>
				runRequest({} as never, async () => {
					RequestContext.current().state.testId = String(index);
					const first = di().User;
					await new Promise((resolve) => setTimeout(resolve, index % 4));
					expect(RequestContext.current().state.testId).toBe(String(index));
					expect(di().User).toBe(first);
					expect(first.id).toBe(String(index));
				})
			)
		);
	});
	it('reuses the event scope for error hooks and isolates nested subrequests', () => {
		const event = {} as never;
		const outer = runRequest(event, () => {
			const context = RequestContext.current();
			context.state.testId = 'outer';
			runRequest({} as never, () => expect(RequestContext.current()).not.toBe(context));
			expect(RequestContext.current()).toBe(context);
			return context;
		});
		runRequest(event, () => expect(RequestContext.current()).toBe(outer));
	});
});
