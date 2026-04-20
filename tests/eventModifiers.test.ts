import { describe, expect, it, vi } from 'vitest';
import { event, immediate, once, prevent, stop } from '../src/lib/core/ui/eventModifiers/EventModifiers.js';

const createMockEvent = () => {
	return {
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
		stopImmediatePropagation: vi.fn()
	} as unknown as Event;
};

describe('EventModifiers', () => {
	it('prevent modifier calls preventDefault', () => {
		const fn = vi.fn();
		const handler = prevent(fn);
		const eventObj = createMockEvent();

		handler(eventObj);

		expect(eventObj.preventDefault).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('stop and immediate modifiers call propagation stoppers', () => {
		const fn = vi.fn();
		const stopHandler = stop(fn);
		const immediateHandler = immediate(fn);
		const eventObj = createMockEvent();

		stopHandler(eventObj);
		immediateHandler(eventObj);

		expect(eventObj.stopPropagation).toHaveBeenCalledTimes(1);
		expect(eventObj.stopImmediatePropagation).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('once modifier runs callback only once', () => {
		const fn = vi.fn();
		const handler = once(fn);
		const eventObj = createMockEvent();

		handler(eventObj);
		handler(eventObj);

		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('supports chained modifiers from event proxy', () => {
		const fn = vi.fn();
		const handler = event.prevent.stop.once(fn);
		const eventObj = createMockEvent();

		handler(eventObj);
		handler(eventObj);

		expect(eventObj.preventDefault).toHaveBeenCalledTimes(1);
		expect(eventObj.stopPropagation).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
