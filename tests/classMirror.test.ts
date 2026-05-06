import { describe, expect, it } from 'vitest';
import { ClassMirror } from '../src/lib/shared/class-mirror/ClassMirror.js';

class Counter {
	constructor(private readonly value: number) {}
	add(step: number) {
		return this.value + step;
	}
	multiply(step: number) {
		return this.value * step;
	}
}

class CounterService extends ClassMirror {
	constructor(counter: Counter) {
		super(counter);
	}

	add(step: number) {
		return step + 100;
	}
}

describe('ClassMirror', () => {
	it('mirrors prototype methods and keeps original context binding', () => {
		const counter = new Counter(5);
		const mirror = new ClassMirror(counter) as unknown as {
			add: (step: number) => number;
			multiply: (step: number) => number;
		};

		expect(mirror.add(2)).toBe(7);
		expect(mirror.multiply(3)).toBe(15);
	});

	it('does not expose constructor as mirrored method', () => {
		const mirror = new ClassMirror(new Counter(1)) as unknown as Record<string, unknown>;
		expect(Object.prototype.hasOwnProperty.call(mirror, 'constructor')).toBe(false);
	});

	it('keeps service method override over mirrored repository method', () => {
		const service = new CounterService(new Counter(5)) as unknown as { add: (step: number) => number; multiply: (step: number) => number };
		expect(service.add(2)).toBe(102);
		expect(service.multiply(3)).toBe(15);
	});
});
