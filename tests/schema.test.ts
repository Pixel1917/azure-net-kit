import { describe, expect, it } from 'vitest';
import { createRules } from '../src/lib/delivery/schema/rules/Rules.js';
import { validationMessagesEn } from '../src/lib/delivery/schema/rules/messages/En.js';
import { createSchemaFactory, schema, SchemaFail } from '../src/lib/delivery/schema/Schema.js';

describe('Schema', () => {
	const rulesFactory = createRules(validationMessagesEn);

	it('validates and transforms a payload to JSON data', () => {
		const userSchema = schema<{ name: string; age: number }>()
			.rules(() => ({
				name: [rulesFactory.required(), rulesFactory.string({ length: { min: 2 } })],
				age: [rulesFactory.required(), rulesFactory.number({ range: { min: 18 } })]
			}))
			.transform((data) => ({ ...data, name: data.name.trim() }))
			.create();

		const result = userSchema.from({ name: ' John ', age: 21 }).toJson();
		expect(result).toEqual({ name: 'John', age: 21 });
	});

	it('returns validation errors and throws SchemaFail on toJson()', () => {
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

		expect(() => payload.toJson()).toThrow(SchemaFail);
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
			userSchema.from({ role: 'root' }).toJson();
		} catch (err) {
			expect(userSchema.getSchemaError(err)).toEqual({ role: 'This field may contain only one of the following values: admin, user' });
		}
	});

	it('converts to FormData using transformed data', () => {
		const userSchema = schema<{ name: string; age: number }>()
			.transform((data) => ({ ...data, age: Number(data.age) + 1 }))
			.create();

		const formData = userSchema.from({ name: 'Kate', age: 20 }).toFormData();
		expect(formData.get('name')).toBe('Kate');
		expect(formData.get('age')).toBe('21');
	});

	it('exposes toJson and toFormData from validated()', () => {
		const userSchema = schema<{ name: string }>()
			.transform((data) => ({ ...data, name: data.name.trim() }))
			.create();
		const validated = userSchema.from({ name: ' Kate ' }).validated();

		expect(validated.toJson()).toEqual({ name: 'Kate' });
		expect(validated.toFormData().get('name')).toBe('Kate');
		expect('json' in validated).toBe(false);
		expect('formData' in validated).toBe(false);
	});

	it('condition skips the remaining field rules when predicate is false', () => {
		const userSchema = schema<{ validateNickname: boolean; nickname?: string }>()
			.rules(() => ({
				nickname: [
					rulesFactory.condition(({ listValues }) => listValues?.validateNickname === true),
					rulesFactory.required(),
					rulesFactory.string({ length: { min: 3 } })
				]
			}))
			.create();

		expect(userSchema.from({ validateNickname: false }).validated()).toMatchObject({ valid: true, errors: {} });
		expect(userSchema.from({ validateNickname: true }).validated()).toMatchObject({
			valid: false,
			errors: { nickname: 'This field is required' }
		});
		expect(userSchema.from({ validateNickname: true, nickname: 'valid' }).validated()).toMatchObject({ valid: true, errors: {} });
	});

	it('condition also skips remaining nested array field rules', () => {
		const listSchema = schema<{ items: Array<{ enabled: boolean; name?: string }> }>()
			.rules(() => ({
				items: [
					rulesFactory.array({
						schema: {
							name: [
								rulesFactory.condition(({ listValues, key }) => {
									const index = Number(String(key).match(/\[(\d+)\]/)?.[1]);
									return listValues?.items?.[index]?.enabled === true;
								}),
								rulesFactory.required()
							]
						}
					})
				]
			}))
			.create();

		expect(listSchema.from({ items: [{ enabled: false }] }).validated()).toMatchObject({ valid: true, errors: {} });
		expect(listSchema.from({ items: [{ enabled: true }] }).validated()).toMatchObject({
			valid: false,
			errors: { items: [{ name: 'This field is required' }] }
		});
	});
});
