import { describe, expect, it, vi } from 'vitest';
import { createRules } from '../src/lib/delivery/schema/rules/Rules.js';
import { validationMessagesEn } from '../src/lib/delivery/schema/rules/messages/En.js';
import { validationMessagesRu } from '../src/lib/delivery/schema/rules/messages/Ru.js';
import { validationMessagesI18n } from '../src/lib/delivery/schema/rules/messages/WithI18n.js';

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

	it('email rule supports optional normalization, length and domain constraints', () => {
		expect(rules.email()({ val: ' test@example.com ' })).toBe('Invalid email address');
		expect(rules.email({ trim: true })({ val: ' test@example.com ' })).toBeUndefined();
		expect(rules.email({ maxLength: 15 })({ val: 'long@example.com' })).toBe('Email address must not exceed 15 characters');

		const corporateEmail = rules.email({ allowedDomains: ['@Company.com', 'partner.com'] });
		expect(corporateEmail({ val: 'user@company.com' })).toBeUndefined();
		expect(corporateEmail({ val: 'user@other.com' })).toBe('Email domain must be one of: company.com, partner.com');

		const blockedEmail = rules.email({ blockedDomains: [' disposable.test '] });
		expect(blockedEmail({ val: 'user@disposable.test' })).toBe('Email domain is not allowed: disposable.test');
		expect(blockedEmail({ val: 'user@example.com' })).toBeUndefined();
		expect(rules.email({ allowedDomains: [], blockedDomains: [] })({ val: 'user@example.com' })).toBeUndefined();
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

	it('phone rule supports optional country code and digit limits', () => {
		const international = rules.phone({ requireCountryCode: true });
		expect(international({ val: '2025550173' })).toBe('Phone number must include an international country code');
		expect(international({ val: '+1 (202) 555-0173' })).toBeUndefined();

		const bounded = rules.phone({ minDigits: 10, maxDigits: 11 });
		expect(bounded({ val: '123456789' })).toBe('Phone number must contain at least 10 digits');
		expect(bounded({ val: '123456789012' })).toBe('Phone number must contain at most 11 digits');
		expect(bounded({ val: '1234567890' })).toBeUndefined();
		expect(bounded({ val: '+12345678901' })).toBeUndefined();
	});

	it('pattern rule handles regular and stateful expressions deterministically', () => {
		const slug = rules.pattern({ regexp: /^[a-z]+(?:-[a-z]+)*$/ });
		expect(slug({ val: 'azure-net-kit' })).toBeUndefined();
		expect(slug({ val: 'Azure Net' })).toBe('Invalid field format');
		expect(slug({ val: 123 })).toBe('Invalid field format');

		const stateful = rules.pattern({ regexp: /foo/g });
		expect(stateful({ val: 'foo' })).toBeUndefined();
		expect(stateful({ val: 'foo' })).toBeUndefined();
		expect(rules.pattern({ regexp: /^ok$/, message: () => 'custom pattern' })({ val: 'no' })).toBe('custom pattern');
	});

	it('url rule validates absolute URLs, protocols and optional relative paths', () => {
		expect(rules.url()({ val: 'https://azure-net.dev/path?query=1' })).toBeUndefined();
		expect(rules.url()({ val: '/account/profile' })).toBe('Invalid URL format');
		expect(rules.url({ allowRelative: true })({ val: '/account/profile' })).toBeUndefined();
		expect(rules.url({ allowRelative: true })({ val: '//evil.example' })).toBe('Invalid URL format');

		const httpsOnly = rules.url({ protocols: ['HTTPS:'] });
		expect(httpsOnly({ val: 'https://azure-net.dev' })).toBeUndefined();
		expect(httpsOnly({ val: 'http://azure-net.dev' })).toBe('URL protocol must be one of: https');
		expect(httpsOnly({ val: 'not a url' })).toBe('Invalid URL format');
	});

	it('file rule validates single and multiple file-like values', () => {
		const createFile = (name: string, type: string, size: number) => ({
			name,
			type,
			size,
			arrayBuffer: async () => new ArrayBuffer(size)
		});
		const image = createFile('Avatar.PNG', 'image/png', 128);
		const document = createFile('terms.pdf', 'application/pdf', 256);

		expect(rules.file()({ val: image })).toBeUndefined();
		expect(rules.file()({ val: [image, document] })).toBeUndefined();
		expect(rules.file()({ val: [] })).toBe('This field must contain a file');
		expect(rules.file()({ val: { name: 'fake.png' } })).toBe('This field must contain a file');
	});

	it('file rule supports optional size, MIME and extension constraints', () => {
		const createFile = (name: string, type: string, size: number) => ({
			name,
			type,
			size,
			arrayBuffer: async () => new ArrayBuffer(0)
		});
		const validator = rules.file({ maxSize: 1024, mimeTypes: ['image/*'], extensions: ['.png', 'JPG'] });

		expect(validator({ val: createFile('avatar.PNG', 'IMAGE/PNG', 1024) })).toBeUndefined();
		expect(validator({ val: createFile('avatar.png', 'image/png', 1025) })).toBe('File size must not exceed 1024 bytes');
		expect(validator({ val: createFile('avatar.png', 'application/pdf', 100) })).toBe('File type must be one of: image/*');
		expect(validator({ val: createFile('avatar.gif', 'image/gif', 100) })).toBe('File extension must be one of: png, jpg');
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

	it('date rule validates inclusive min and max ranges', () => {
		const minOnly = rules.date({ range: { min: '2024-05-10' } });
		expect(minOnly({ val: '2024-05-09' })).toBe('The date must be on or after 2024-05-10');
		expect(minOnly({ val: '2024-05-10' })).toBeUndefined();
		expect(minOnly({ val: '2024-06-01' })).toBeUndefined();

		const max = new Date('2024-05-20T00:00:00.000Z');
		const maxOnly = rules.date({ range: { max } });
		expect(maxOnly({ val: '2024-05-21T00:00:00Z' })).toBe('The date must be on or before 2024-05-20T00:00:00.000Z');
		expect(maxOnly({ val: max })).toBeUndefined();

		const bounded = rules.date({ range: { min: '2024-05-10', max: '2024-05-20' } });
		expect(bounded({ val: '2024-05-15' })).toBeUndefined();
		expect(bounded({ val: '2024-05-09' })).toBe('The date must be on or after 2024-05-10');
		expect(bounded({ val: '2024-05-21' })).toBe('The date must be on or before 2024-05-20');
	});

	it('date rule supports custom range messages', () => {
		const date = rules.date({
			range: { min: '2024-01-01', max: '2024-12-31' },
			message: {
				min: () => 'too early',
				max: () => 'too late'
			}
		});

		expect(date({ val: '2023-12-31' })).toBe('too early');
		expect(date({ val: '2025-01-01' })).toBe('too late');
		expect(date({ val: 'invalid' })).toBe('Invalid date format');
	});

	it('date range provides Russian and i18n messages', () => {
		const russianDate = createRules(validationMessagesRu).date({ range: { min: '2024-01-01', max: '2024-12-31' } });
		expect(russianDate({ val: '2023-12-31' })).toBe('Дата должна быть не раньше 2024-01-01');
		expect(russianDate({ val: '2025-01-01' })).toBe('Дата должна быть не позже 2024-12-31');

		const i18nDate = createRules(validationMessagesI18n).date({ range: { min: '2024-01-01', max: '2024-12-31' } });
		expect(i18nDate({ val: 'invalid' })).toBe('validation.date');
		expect(i18nDate({ val: '2023-12-31' })).toEqual({ key: 'validation.dateMin', vars: { value: '2024-01-01' } });
		expect(i18nDate({ val: '2025-01-01' })).toEqual({ key: 'validation.dateMax', vars: { value: '2024-12-31' } });
	});

	it('condition exposes complete validation params', () => {
		const predicate = vi.fn(() => true);
		const condition = rules.condition(predicate);
		const params = { val: 'value', listValues: { enabled: true }, key: 'name' };

		expect(condition(params)).toBeUndefined();
		expect(predicate).toHaveBeenCalledWith(params);
	});

	it('sameAs and notSameAs compare primitives and objects deeply', () => {
		type Values = { password: string; confirmation: string; current: object; next: object };
		const sameAs = rules.sameAs<Values, string>({ key: 'password' });
		const notSameAs = rules.notSameAs<Values, string>({ key: 'password' });

		expect(sameAs({ val: 'secret', listValues: { password: 'secret' } })).toBeUndefined();
		expect(sameAs({ val: 'other', listValues: { password: 'secret' } })).toBe('This field must match the password field');
		expect(notSameAs({ val: 'secret', listValues: { password: 'secret' } })).toBe('This field must not match the password field');
		expect(notSameAs({ val: 'other', listValues: { password: 'secret' } })).toBeUndefined();

		const value = { nested: { id: 1 }, enabled: true };
		const reordered = { enabled: true, nested: { id: 1 } };
		const sameObject = rules.sameAs<Values, typeof value>({ key: 'current' });
		const notSameObject = rules.notSameAs<Values, typeof value>({ key: 'current' });
		expect(sameObject({ val: value, listValues: { current: reordered } })).toBeUndefined();
		expect(notSameObject({ val: value, listValues: { current: reordered } })).toBe('This field must not match the current field');
	});
});
