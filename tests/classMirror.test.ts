import { describe, expect, it } from 'vitest';
import { ClassMirror } from '../src/lib/core/shared/classMirror/ClassMirror.js';

class Counter {
	constructor(private readonly value: number) {}
	add(step: number) {
		return this.value + step;
	}
	multiply(step: number) {
		return this.value * step;
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
		const mirror = new ClassMirror(new Counter(1)) as Record<string, unknown>;
		expect(Object.prototype.hasOwnProperty.call(mirror, 'constructor')).toBe(false);
	});
});
