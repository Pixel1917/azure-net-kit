import { describe, expect, it } from 'vitest';
import { createRules } from '../src/lib/delivery/schema/rules/Rules.js';
import { validationMessagesEn } from '../src/lib/delivery/schema/rules/messages/En.js';

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

	it('phone rule supports international and local formats', () => {
		const phone = rules.phone();

		expect(phone({ val: '+1 (202) 555-0173' })).toBeUndefined();
		expect(phone({ val: '+44 20 7946 0958' })).toBeUndefined();
		expect(phone({ val: '+7 (999) 123-45-67' })).toBeUndefined();
		expect(phone({ val: '2025550173' })).toBeUndefined();

		expect(phone({ val: '+0123456789' })).toBe('Invalid phone number format');
		expect(phone({ val: '12345' })).toBe('Invalid phone number format');
		expect(phone({ val: '+1-800-CALL-NOW' })).toBe('Invalid phone number format');
		expect(phone({ val: '++12025550173' })).toBe('Invalid phone number format');
	});

	it('date rule validates Date instances and date strings', () => {
		const date = rules.date();

		expect(date({ val: new Date('2024-05-23T00:00:00Z') })).toBeUndefined();
		expect(date({ val: '2024-05-23' })).toBeUndefined();
		expect(date({ val: '2024-05-23T15:30:00Z' })).toBeUndefined();

		expect(date({ val: new Date('invalid') })).toBe('Invalid date format');
		expect(date({ val: '05/23/2024' })).toBe('Invalid date format');
		expect(date({ val: 1716422400000 })).toBe('Invalid date format');
	});
});
