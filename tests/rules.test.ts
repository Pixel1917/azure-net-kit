import { describe, expect, it } from 'vitest';
import { createRules } from '../src/lib/core/delivery/schema/rules/Rules.js';
import { validationMessagesEn } from '../src/lib/core/delivery/schema/rules/messages/En.js';

describe('Rules', () => {
	const rules = createRules(validationMessagesEn);

	it('string rule validates type and length', () => {
		const validator = rules.string({ length: { min: 2, max: 4 } });
		expect(validator({ val: 10 })).toBe('This field must be a string');
		expect(validator({ val: 'a' })).toBe('Minimum string length is 2');
		expect(validator({ val: 'abcde' })).toBe('Maximum string length is 4');
		expect(validator({ val: 'abcd' })).toBeUndefined();
	});

	it('number and finite rules validate constraints', () => {
		const numberValidator = rules.number({ range: { min: 2, max: 5 } });
		expect(numberValidator({ val: 'abc' })).toBe('This field must be an integer');
		expect(numberValidator({ val: 1 })).toBe('The number must be at least 2');
		expect(numberValidator({ val: 10 })).toBe('The number must be at most 5');
		expect(numberValidator({ val: 3 })).toBeUndefined();

		const finiteValidator = rules.finite({ maxDigitsAfterDot: 2, range: { min: 1, max: 3 } });
		expect(finiteValidator({ val: '.2' })).toBe('This field must be a number');
		expect(finiteValidator({ val: 1.234 })).toBe('Number of digits after the decimal point must not exceed 2');
		expect(finiteValidator({ val: 4 })).toBe('The number must be at most 3');
	});

	it('required, boolean and allowedOnly rules', () => {
		expect(rules.required()({ val: '' })).toBe('This field is required');
		expect(rules.required()({ val: 'x' })).toBeUndefined();

		expect(rules.boolean({ expected: true })({ val: false })).toBe('Expected value: true');
		expect(rules.boolean({ expected: true })({ val: true })).toBeUndefined();

		expect(rules.allowedOnly({ allowed: ['a', 'b'] })({ val: 'c' })).toBe('This field may contain only one of the following values: a, b');
	});

	it('array rule validates nested item schema', () => {
		const validator = rules.array<{ items: Array<{ name: string }> }>({
			schema: {
				name: [rules.required(), rules.string({ length: { min: 2 } })]
			}
		});

		const result = validator({
			val: [{ name: '' }, { name: 'Ok' }],
			listValues: { items: [{ name: '' }, { name: 'Ok' }] },
			key: 'items'
		});

		expect(result).toEqual([{ name: 'This field is required' }, {}]);
	});

	it('password and email rules', () => {
		const password = rules.password({ length: 6, numbers: 1, specialChars: 1, lowerUpperCasePattern: true });
		expect(password({ val: 'short' })).toBe('Minimum password length is 6');
		expect(password({ val: 'NoNumber!' })).toBe('Password must contain at least 1 number(s)');
		expect(password({ val: 'withnumber1' })).toBe('Password must contain at least 1 special character(s)');
		expect(password({ val: 'Valid1!' })).toBeUndefined();

		const email = rules.email();
		expect(email({ val: 'bad-email' })).toBe('Invalid email address');
		expect(email({ val: 'test@example.com' })).toBeUndefined();
	});
});
