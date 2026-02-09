import type { BaseValidationMessages } from './messages/types.js';
import type { ValidationErrorsMap, ValidationMessage, ValidationParams, ValidationRuleResult } from '../index.js';
import { masks } from '../../../constants/masks.js';

export type ValidationRuleParams<T extends keyof BaseValidationMessages, D = object> = D & { message?: BaseValidationMessages[T] };

export type LengthParams = { length?: { min?: number; max?: number } };
export type RangeParams = { range?: { min?: number; max?: number } };

type ArrayItemRules<Context> = ValidationRuleResult<Context>[] | Record<string, ValidationRuleResult<Context>[]>;

type ArrayParams<Context> = LengthParams & { schema?: ArrayItemRules<Context> };

/**
 *
 * @param validationMessages - BaseValidationMessages
 * @returns ValidationRuleResult<T, D>
 * @description Creates the rules for the schema.
 */
export const createRules = <M extends BaseValidationMessages>(validationMessages: M) => {
	const checkVal = <Val>(val: Val) => {
		return val !== undefined && val !== null;
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'string', LengthParams>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a string and if it is within the length specified in the params.
	 */
	const string = <T = unknown, D = unknown>(params?: ValidationRuleParams<'string', LengthParams>): ValidationRuleResult<T, D> => {
		const { message, length } = { ...params, message: { ...validationMessages.string, ...params?.message } };
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				if (typeof val !== 'string') {
					return message.base();
				}
				switch (true) {
					case length && checkVal(length.min) && val.length < length.min:
						return message.min(length.min);
					case length && checkVal(length.max) && val.length > length.max:
						return message.max(length.max);
					default:
						return undefined;
				}
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'number', RangeParams>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a whole number (integer) and if it is within the range specified in the params.
	 */
	const number = <T = unknown, D = unknown>(params?: ValidationRuleParams<'number', RangeParams>): ValidationRuleResult<T, D> => {
		const { message, range } = { ...params, message: { ...validationMessages.number, ...params?.message } };
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				const numberVal = Number(val);
				if (!Number.isInteger(numberVal) || Number.isNaN(numberVal)) {
					return message.base();
				}
				switch (true) {
					case range && checkVal(range?.min) && numberVal < range.min:
						return message.min(range.min);
					case range && checkVal(range?.max) && numberVal > range.max:
						return message.max(range.max);
					default:
						return undefined;
				}
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'finite', RangeParams & { maxDigitsAfterDot?: number }>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a finite number and if it is within the range specified in the params.
	 */
	const finite = <T = unknown, D = unknown>(
		params?: ValidationRuleParams<'finite', RangeParams & { maxDigitsAfterDot?: number }>
	): ValidationRuleResult<T, D> => {
		const { message, maxDigitsAfterDot, range } = { ...params, message: { ...validationMessages.finite, ...params?.message } };
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				const numVal = Number(val);
				if (!Number.isFinite(numVal) || String(val)[0] === '.') {
					return message.base();
				}
				if (typeof maxDigitsAfterDot === 'number') {
					const digitsAfterDot = val.toString().split('.')[1]?.length ?? 0;
					if (digitsAfterDot > maxDigitsAfterDot) {
						return message.maxDigitsAfterDot(maxDigitsAfterDot);
					}
				}
				if (range?.min !== undefined && numVal < range.min) return message.min(range.min);
				if (range?.max !== undefined && numVal > range.max) return message.max(range.max);
				return undefined;
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'boolean', { expected?: boolean }>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a boolean and if it is the expected value specified in the params.
	 */
	const boolean = <T = unknown, D = unknown>(params?: ValidationRuleParams<'boolean', { expected?: boolean }>): ValidationRuleResult<T, D> => {
		const { message, expected } = { ...params, message: { ...validationMessages.boolean, ...params?.message } };
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				if (typeof val !== 'boolean') return message.base();
				if (expected !== undefined && val !== expected) return message.expected(String(expected));
				return undefined;
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'array', ArrayParams<T>>
	 * @returns ValidationRuleResult<T>
	 * @description Checks if the value is an array and if it is within the length specified in the params. Can check every array item with the rules specified in the schema.
	 */
	const array = <T = unknown>(params?: ValidationRuleParams<'array', ArrayParams<T>>): ValidationRuleResult<T> => {
		const { message, length = {}, schema } = { ...params, message: { ...validationMessages.array, ...params?.message } };

		return ({ val, listValues, key }) => {
			if (checkVal(val)) {
				if (!Array.isArray(val)) return message.base();

				if (length.min && val.length < length.min) return message.min(length.min);
				if (length.max && val.length > length.max) return message.max(length.max);

				if (schema) {
					const nestedErrors: ValidationErrorsMap[] = [];

					for (let index = 0; index < val.length; index++) {
						const element = val[index];
						const itemErrors: ValidationErrorsMap = {};

						if (Array.isArray(schema)) {
							for (const rule of schema) {
								const fail = rule({
									val: element,
									listValues,
									key: `${key}[${index}]`
								});
								if (fail) {
									itemErrors['_error'] = fail as ValidationMessage | ValidationErrorsMap;
									break;
								}
							}
						} else if (typeof schema === 'object' && schema !== null) {
							if (typeof element !== 'object' || element === null) {
								itemErrors['_error'] = message.base();
							} else {
								for (const fieldKey in schema) {
									const fieldRules = schema[fieldKey] ?? [];
									const fieldValue = (element as Record<string, unknown>)?.[fieldKey];
									for (const rule of fieldRules) {
										const fail = rule({
											val: fieldValue,
											listValues,
											key: `${key}[${index}].${fieldKey}`
										});
										if (fail) {
											itemErrors[fieldKey] = fail as ValidationMessage | ValidationErrorsMap;
											break;
										}
									}
								}
							}
						}

						nestedErrors[index] = itemErrors;
					}

					if (nestedErrors.some((e) => Object.keys(e).length > 0)) {
						return nestedErrors;
					}
				}
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'phone'>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a phone number and if it is valid.
	 */
	const countryCodes = new Set(Object.values(masks).map((country) => country.cc)).add('8');
	const phone = <T = unknown, D = unknown>(params?: ValidationRuleParams<'phone'>): ValidationRuleResult<T, D> => {
		const { message } = { ...params, message: params?.message ?? validationMessages.phone };

		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				// eslint-disable-next-line
				const cleanedVal = String(val).replace(/[\s\-\(\)\.]/g, '');

				if (!cleanedVal) {
					return message();
				}

				if (!/^\+?\d+$/.test(cleanedVal)) {
					return message();
				}

				if (cleanedVal.length < 7 || cleanedVal.length > 16) {
					return message();
				}

				let hasValidCountryCode = false;

				if (cleanedVal.startsWith('+')) {
					const sortedCodes = Array.from(countryCodes)
						.filter((code) => code.startsWith('+'))
						.sort((a, b) => b.length - a.length);

					for (const code of sortedCodes) {
						if (cleanedVal.startsWith(code)) {
							const remainingDigits = cleanedVal.slice(code.length);
							if (remainingDigits.length >= 4) {
								hasValidCountryCode = true;
								break;
							}
						}
					}
				} else if (cleanedVal.startsWith('8')) {
					if (cleanedVal.length === 11) {
						hasValidCountryCode = true;
					}
				} else if (/^\d+$/.test(cleanedVal)) {
					const codesWithoutPlus = Array.from(countryCodes)
						.filter((code) => !code.startsWith('+') && code !== 'N/A')
						.map((code) => code.replace('+', ''))
						.sort((a, b) => b.length - a.length);

					for (const code of codesWithoutPlus) {
						if (cleanedVal.startsWith(code)) {
							const remainingDigits = cleanedVal.slice(code.length);
							if (remainingDigits.length >= 4) {
								hasValidCountryCode = true;
								break;
							}
						}
					}

					if (!hasValidCountryCode && cleanedVal.length >= 7 && cleanedVal.length <= 10) {
						hasValidCountryCode = true;
					}
				}

				return hasValidCountryCode ? undefined : message();
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'email'>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a valid email address.
	 */
	const email = <T = unknown, D = unknown>(params?: ValidationRuleParams<'email'>): ValidationRuleResult<T, D> => {
		const { message } = { message: params?.message ?? validationMessages.email };
		const emailRegExp =
			// eslint-disable-next-line no-control-regex
			/^(?:[A-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21\x23-\x5B\x5D-\x7F]|[\x01-\x09\x0B\x0C\x0E-\x7F])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]{2,}(?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21-\x5A\x53-\x7F]|\\[\x01-\x09\x0B\x0C\x0E-\x7F])+)])$/i;
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				const stringedVal = typeof val === 'string' ? String(val) : undefined;
				return stringedVal && emailRegExp.test(stringedVal) ? undefined : message();
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'lettersOnly', { whiteSpaces?: boolean }>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a string and if it contains only letters.
	 */
	const lettersOnly = <T = unknown, D = unknown>(
		params?: ValidationRuleParams<'lettersOnly', { whiteSpaces?: boolean }>
	): ValidationRuleResult<T, D> => {
		const { message, whiteSpaces = false } = { ...params, message: params?.message ?? validationMessages.lettersOnly };
		const lettersRegex = whiteSpaces ? /^[а-яА-Яa-zA-Z\s]+$/ : /^[а-яА-Яa-zA-Z]+$/;
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				const stringedVal = typeof val === 'string' ? String(val) : undefined;
				return stringedVal && lettersRegex.test(stringedVal) ? undefined : message(whiteSpaces);
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'allowedOnly', { allowed?: unknown[] }>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is in the allowed values specified in the params.
	 */
	const allowedOnly = <T = unknown, D = unknown>(
		params?: ValidationRuleParams<'allowedOnly', { allowed?: unknown[] }>
	): ValidationRuleResult<T, D> => {
		const { message, allowed } = { ...params, message: params?.message ?? validationMessages.allowedOnly };
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				switch (true) {
					case !!allowed && Array.isArray(allowed):
						if (!allowed?.length) {
							return message('');
						}
						return allowed.includes(val) ? undefined : message(allowed.join(', '));
					default:
						return undefined;
				}
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'sameAs', { key: keyof T | string }>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is the same as the value of the field specified in the params.
	 */
	const sameAs = <T = unknown, D = unknown>(params: ValidationRuleParams<'sameAs', { key: keyof T | string }>): ValidationRuleResult<T, D> => {
		const { message, key } = { ...params, message: params?.message ?? validationMessages.sameAs };
		return ({ val, listValues }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				switch (true) {
					case typeof val === 'object':
						if (!listValues?.[key as keyof T] || typeof listValues[key as keyof T] !== 'object') {
							return message(String(key));
						}
						try {
							return JSON.stringify(val) === JSON.stringify(listValues[key as keyof T]) ? undefined : message(String(key));
						} catch {
							return 'Parsing error';
						}
					default:
						return String(val ?? '') === String(listValues?.[key as keyof T] ?? '') ? undefined : message(String(key));
				}
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'notSameAs', { key: keyof T | string }>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is not the same as the value of the field specified in the params.
	 */
	const notSameAs = <T = unknown, D = unknown>(params: ValidationRuleParams<'sameAs', { key: keyof T | string }>): ValidationRuleResult<T, D> => {
		const { message, key } = { ...params, message: params?.message ?? validationMessages.notSameAs };
		return ({ val, listValues }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				switch (true) {
					case typeof val === 'object':
						if (!listValues?.[key as keyof T] || typeof listValues[key as keyof T] !== 'object') {
							return message(String(key));
						}
						try {
							return JSON.stringify(val) !== JSON.stringify(listValues[key as keyof T]) ? undefined : message(String(key));
						} catch {
							return 'Parsing error';
						}
					default:
						return String(val) === String(listValues?.[key as keyof T]) ? undefined : message(String(key));
				}
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'required', { byCondition?: (params: ValidationParams<T, D, J>) => boolean }>
	 * @returns ValidationRuleResult<T, D, J>
	 * @description Marks the field as required. If the byCondition is specified, the field will be required only if the byCondition returns true.
	 */
	const required = <T = unknown, D = unknown, J = unknown>(
		params?: ValidationRuleParams<'required', { byCondition?: (params: ValidationParams<T, D, J>) => boolean }>
	): ValidationRuleResult<T, D, J> => {
		const { message, byCondition } = { ...params, message: params?.message ?? validationMessages.required };
		return ({ val, listValues, key }: ValidationParams<T, D, J>): ValidationMessage | undefined => {
			if (byCondition && !byCondition({ val, listValues, key })) return undefined;
			if (!checkVal(val)) return message();
			if (typeof val === 'string' && !val.length) return message();
			if (val instanceof File && val.size < 1) return message();
			if (typeof val === 'number' && !String(val).length) return message();

			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'password', { length?: number; specialChars?: boolean | number; numbers?: boolean | number; lowerUpperCasePattern?: boolean }>
	 * @returns ValidationRuleResult<T, D>
	 * @description Sets the password rules. Can check the length, the number of special characters, the number of numbers and the presence of uppercase and lowercase letters.
	 */
	const password = <T = unknown, D = unknown>(
		params?: ValidationRuleParams<
			'password',
			{ length?: number; specialChars?: boolean | number; numbers?: boolean | number; lowerUpperCasePattern?: boolean }
		>
	): ValidationRuleResult<T, D> => {
		const {
			message,
			length = 8,
			specialChars,
			numbers,
			lowerUpperCasePattern
		} = { ...params, message: { ...validationMessages.password, ...params?.message } };
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (!checkVal(val)) return undefined;
			const str = String(val);

			if (str.length < length) {
				return message.length(length);
			}

			if (specialChars) {
				const minCount = typeof specialChars === 'number' ? specialChars : 1;
				const count = (str.match(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/g) || []).length;
				if (count < minCount) {
					return message.specialChars(minCount);
				}
			}

			if (numbers) {
				const minCount = typeof numbers === 'number' ? numbers : 1;
				const count = (str.match(/[0-9]/g) || []).length;
				if (count < minCount) {
					return message.numbers(minCount);
				}
			}

			if (lowerUpperCasePattern) {
				const hasLower = /[a-z]/.test(str);
				const hasUpper = /[A-Z]/.test(str);
				if (!hasLower || !hasUpper) {
					return message.lowerUpperCasePattern();
				}
			}

			return undefined;
		};
	};

	return { string, number, required, password, notSameAs, sameAs, array, boolean, email, finite, lettersOnly, phone, allowedOnly };
};
