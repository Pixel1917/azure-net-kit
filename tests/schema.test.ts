import { describe, expect, it } from 'vitest';
import { createRules } from '../src/lib/core/delivery/schema/rules/Rules.js';
import { validationMessagesEn } from '../src/lib/core/delivery/schema/rules/messages/En.js';
import { createSchemaFactory, schema, SchemaFail } from '../src/lib/core/delivery/schema/Schema.js';

describe('Schema', () => {
	const rulesFactory = createRules(validationMessagesEn);

	it('validates and transforms json payload', () => {
		const userSchema = schema<{ name: string; age: number }>()
			.rules(() => ({
				name: [rulesFactory.required(), rulesFactory.string({ length: { min: 2 } })],
				age: [rulesFactory.required(), rulesFactory.number({ range: { min: 18 } })]
			}))
			.transform((data) => ({ ...data, name: data.name.trim() }))
			.create();

		const result = userSchema.from({ name: ' John ', age: 21 }).json();
		expect(result).toEqual({ name: 'John', age: 21 });
	});

	it('returns validation errors and throws SchemaFail on json()', () => {
		const userSchema = schema<{ name: string; age: number }>()
			.rules(() => ({
				name: [rulesFactory.required(), rulesFactory.string({ length: { min: 2 } })],
				age: [rulesFactory.number({ range: { min: 18 } })]
			}))
			.create();

		const payload = userSchema.from({ name: '', age: 12 });
		const validated = payload.validated();

		expect(validated.valid).toBe(false);
		expect(validated.errors).toEqual({
			name: 'This field is required',
			age: 'The number must be at least 18'
		});

		expect(() => payload.json()).toThrow(SchemaFail);
	});

	it('supports custom methods via with() and getSchemaError()', () => {
		const schemaFactory = createSchemaFactory(rulesFactory);
		const userSchema = schemaFactory<{ role: string }>()
			.rules(() => ({ role: [rulesFactory.allowedOnly({ allowed: ['admin', 'user'] })] }))
			.with(() => ({
				defaults: () => ({ role: 'user' })
			}))
			.create();

		expect(userSchema.defaults()).toEqual({ role: 'user' });

		try {
			userSchema.from({ role: 'root' }).json();
		} catch (err) {
			expect(userSchema.getSchemaError(err)).toEqual({ role: 'This field may contain only one of the following values: admin, user' });
		}
	});

	it('converts to FormData using transformed data', () => {
		const userSchema = schema<{ name: string; age: number }>()
			.transform((data) => ({ ...data, age: Number(data.age) + 1 }))
			.create();

		const formData = userSchema.from({ name: 'Kate', age: 20 }).formData();
		expect(formData.get('name')).toBe('Kate');
		expect(formData.get('age')).toBe('21');
	});
});
