import { DateUtil, ObjectUtil } from '../../../external/tools/index.js';
import type { BaseValidationMessages } from './messages/Types.js';
import { SKIP_REMAINING_VALIDATION } from '../Schema.js';
import type { ValidationErrorsMap, ValidationMessage, ValidationParams, ValidationRuleResult } from '../index.js';

type ValidationMessageOverride<T> = T extends (...args: never[]) => unknown ? T : Partial<T>;

export type ValidationRuleParams<T extends keyof BaseValidationMessages, D = object> = D & {
	message?: ValidationMessageOverride<BaseValidationMessages[T]>;
};

export type LengthParams = { length?: { min?: number; max?: number } };
export type RangeParams = { range?: { min?: number; max?: number } };
export type DateRangeParams = { range?: { min?: Date | string; max?: Date | string } };
export type PatternParams = { regexp: RegExp };
export type UrlParams = { protocols?: string[]; allowRelative?: boolean };
export type FileParams = { maxSize?: number; mimeTypes?: string[]; extensions?: string[] };
export type EmailParams = { trim?: boolean; maxLength?: number; allowedDomains?: string[]; blockedDomains?: string[] };
export type PhoneParams = { requireCountryCode?: boolean; minDigits?: number; maxDigits?: number };

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
	 * Checks a value against a regular expression.
	 */
	const pattern = <T = unknown, D = unknown>(params: ValidationRuleParams<'pattern', PatternParams>): ValidationRuleResult<T, D> => {
		const { regexp, message = validationMessages.pattern } = params;

		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (!checkVal(val)) return undefined;
			if (typeof val !== 'string') return message();

			regexp.lastIndex = 0;
			const matches = regexp.test(val);
			regexp.lastIndex = 0;
			return matches ? undefined : message();
		};
	};

	/**
	 * Checks absolute URLs and, when enabled, relative URL paths.
	 */
	const url = <T = unknown, D = unknown>(params?: ValidationRuleParams<'url', UrlParams>): ValidationRuleResult<T, D> => {
		const {
			protocols,
			allowRelative = false,
			message
		} = {
			...params,
			message: { ...validationMessages.url, ...params?.message }
		};
		const normalizedProtocols = protocols?.map((protocol) => protocol.toLowerCase().replace(/:$/, '')).filter(Boolean);

		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (!checkVal(val)) return undefined;
			if (typeof val !== 'string' || !val.length) return message.base();

			let parsed: URL;
			let relative = false;
			try {
				parsed = new URL(val);
			} catch {
				if (!allowRelative || !val.startsWith('/') || val.startsWith('//')) return message.base();
				parsed = new URL(val, 'https://azure-net.local');
				relative = true;
			}

			if (!relative && normalizedProtocols?.length && !normalizedProtocols.includes(parsed.protocol.slice(0, -1).toLowerCase())) {
				return message.protocol(normalizedProtocols.join(', '));
			}
			return undefined;
		};
	};

	/**
	 * Checks one or multiple File/Blob values and optional size, MIME type and extension constraints.
	 */
	const file = <T = unknown, D = unknown>(params?: ValidationRuleParams<'file', FileParams>): ValidationRuleResult<T, D> => {
		const { maxSize, mimeTypes, extensions, message } = {
			...params,
			message: { ...validationMessages.file, ...params?.message }
		};
		const normalizedMimeTypes = mimeTypes?.map((mimeType) => mimeType.trim().toLowerCase()).filter(Boolean);
		const normalizedExtensions = extensions?.map((extension) => extension.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
		const isBlobLike = (value: unknown): value is { size: number; type: string; name?: string; arrayBuffer: () => Promise<ArrayBuffer> } =>
			typeof value === 'object' &&
			value !== null &&
			typeof (value as { size?: unknown }).size === 'number' &&
			typeof (value as { type?: unknown }).type === 'string' &&
			typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function';
		const matchesMimeType = (actual: string, expected: string) => {
			if (expected === '*/*') return true;
			if (expected.endsWith('/*')) return actual.startsWith(expected.slice(0, -1));
			return actual === expected;
		};

		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (!checkVal(val)) return undefined;

			const rawFiles = Array.isArray(val) ? val : typeof FileList !== 'undefined' && val instanceof FileList ? Array.from(val) : [val];
			if (!rawFiles.length || !rawFiles.every(isBlobLike)) return message.base();

			for (const currentFile of rawFiles) {
				if (maxSize !== undefined && currentFile.size > maxSize) return message.maxSize(maxSize);

				const mimeType = currentFile.type.toLowerCase();
				if (normalizedMimeTypes?.length && !normalizedMimeTypes.some((allowed) => matchesMimeType(mimeType, allowed))) {
					return message.mimeType(normalizedMimeTypes.join(', '));
				}

				if (normalizedExtensions?.length) {
					const fileName = currentFile.name?.toLowerCase() ?? '';
					const extension = fileName.includes('.') ? (fileName.split('.').pop() ?? '') : '';
					if (!normalizedExtensions.includes(extension)) return message.extension(normalizedExtensions.join(', '));
				}
			}

			return undefined;
		};
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
								if (fail === SKIP_REMAINING_VALIDATION) break;
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
										if (fail === SKIP_REMAINING_VALIDATION) break;
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
	 * @param params - ValidationRuleParams<'phone', PhoneParams>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a phone number and if it is valid.
	 */
	const phone = <T = unknown, D = unknown>(params?: ValidationRuleParams<'phone', PhoneParams>): ValidationRuleResult<T, D> => {
		const {
			requireCountryCode = false,
			minDigits = 7,
			maxDigits = 15,
			message
		} = {
			...params,
			message: { ...validationMessages.phone, ...params?.message }
		};

		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (checkVal(val)) {
				const rawVal = String(val).trim();
				if (!rawVal) {
					return message.base();
				}

				if (!/^[\d+\s().-]+$/.test(rawVal)) {
					return message.base();
				}

				const normalized = rawVal.replace(/[\s().-]/g, '');
				if (!normalized) {
					return message.base();
				}

				const plusCount = (normalized.match(/\+/g) ?? []).length;
				if (plusCount > 1 || (plusCount === 1 && !normalized.startsWith('+'))) {
					return message.base();
				}

				const hasInternationalPrefix = normalized.startsWith('+');
				const digitsOnly = hasInternationalPrefix ? normalized.slice(1) : normalized;

				if (!/^\d+$/.test(digitsOnly)) {
					return message.base();
				}

				if (requireCountryCode && !hasInternationalPrefix) return message.countryCode();
				if (hasInternationalPrefix && digitsOnly.startsWith('0')) return message.base();
				if (digitsOnly.length < minDigits) return params?.minDigits === undefined ? message.base() : message.minDigits(minDigits);
				if (digitsOnly.length > maxDigits) return params?.maxDigits === undefined ? message.base() : message.maxDigits(maxDigits);
				return undefined;
			}
			return undefined;
		};
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'date', DateRangeParams>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a valid date.
	 */
	const date = <T = unknown, D = unknown>(params?: ValidationRuleParams<'date', DateRangeParams>): ValidationRuleResult<T, D> => {
		const { message, range } = { ...params, message: { ...validationMessages.date, ...params?.message } };

		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (!checkVal(val)) return undefined;
			if (!(val instanceof Date || typeof val === 'string') || !DateUtil.isDate(val)) return message.base();
			if (range?.min !== undefined && DateUtil.isBefore(val, range.min)) return message.min(range.min);
			if (range?.max !== undefined && DateUtil.isAfter(val, range.max)) return message.max(range.max);
			return undefined;
		};
	};

	/**
	 * Stops validation of the current field when the predicate returns false.
	 */
	const condition = <T = unknown, D = unknown, K = string>(
		predicate: (params: ValidationParams<T, D, K>) => boolean
	): ValidationRuleResult<T, D, K> => {
		return (params) => (predicate(params) ? undefined : SKIP_REMAINING_VALIDATION);
	};

	/**
	 *
	 * @param params - ValidationRuleParams<'email', EmailParams>
	 * @returns ValidationRuleResult<T, D>
	 * @description Checks if the value is a valid email address.
	 */
	const email = <T = unknown, D = unknown>(params?: ValidationRuleParams<'email', EmailParams>): ValidationRuleResult<T, D> => {
		const {
			trim = false,
			maxLength,
			allowedDomains,
			blockedDomains,
			message
		} = {
			...params,
			message: { ...validationMessages.email, ...params?.message }
		};
		const normalizeDomain = (domain: string) => domain.trim().toLowerCase().replace(/^@/, '');
		const normalizedAllowedDomains = allowedDomains?.map(normalizeDomain).filter(Boolean);
		const normalizedBlockedDomains = blockedDomains?.map(normalizeDomain).filter(Boolean);
		const emailRegExp =
			// eslint-disable-next-line no-control-regex
			/^(?:[A-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21\x23-\x5B\x5D-\x7F]|[\x01-\x09\x0B\x0C\x0E-\x7F])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]{2,}(?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21-\x5A\x53-\x7F]|\\[\x01-\x09\x0B\x0C\x0E-\x7F])+)])$/i;
		return ({ val }: ValidationParams<T, D>): ValidationMessage | undefined => {
			if (!checkVal(val)) return undefined;
			if (typeof val !== 'string') return message.base();

			const emailValue = trim ? val.trim() : val;
			if (!emailRegExp.test(emailValue)) return message.base();
			if (maxLength !== undefined && emailValue.length > maxLength) return message.maxLength(maxLength);

			const domain = normalizeDomain(emailValue.slice(emailValue.lastIndexOf('@') + 1));
			if (normalizedAllowedDomains?.length && !normalizedAllowedDomains.includes(domain)) {
				return message.allowedDomain(normalizedAllowedDomains.join(', '));
			}
			if (normalizedBlockedDomains?.length && normalizedBlockedDomains.includes(domain)) return message.blockedDomain(domain);
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
			if (!checkVal(val)) return undefined;

			const comparedValue = (listValues as Record<PropertyKey, unknown> | undefined)?.[key as PropertyKey];
			return ObjectUtil.equals(val, comparedValue) ? undefined : message(String(key));
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
			if (!checkVal(val)) return undefined;

			const comparedValue = (listValues as Record<PropertyKey, unknown> | undefined)?.[key as PropertyKey];
			return ObjectUtil.equals(val, comparedValue) ? message(String(key)) : undefined;
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

	return {
		string,
		number,
		required,
		password,
		notSameAs,
		sameAs,
		array,
		boolean,
		email,
		finite,
		lettersOnly,
		phone,
		date,
		condition,
		pattern,
		url,
		file,
		allowedOnly
	};
};
