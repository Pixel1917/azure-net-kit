import type { BaseValidationMessages } from './Types.js';

export const validationMessagesEn: BaseValidationMessages = {
	pattern: () => 'Invalid field format',
	url: {
		base: () => 'Invalid URL format',
		protocol: (value) => `URL protocol must be one of: ${value}`
	},
	file: {
		base: () => 'This field must contain a file',
		maxSize: (value) => `File size must not exceed ${value} bytes`,
		mimeType: (value) => `File type must be one of: ${value}`,
		extension: (value) => `File extension must be one of: ${value}`
	},
	date: {
		base: () => 'Invalid date format',
		min: (value) => `The date must be on or after ${value instanceof Date ? value.toISOString() : value}`,
		max: (value) => `The date must be on or before ${value instanceof Date ? value.toISOString() : value}`
	},
	phone: {
		base: () => 'Invalid phone number format',
		countryCode: () => 'Phone number must include an international country code',
		minDigits: (value) => `Phone number must contain at least ${value} digits`,
		maxDigits: (value) => `Phone number must contain at most ${value} digits`
	},
	email: {
		base: () => 'Invalid email address',
		maxLength: (value) => `Email address must not exceed ${value} characters`,
		allowedDomain: (value) => `Email domain must be one of: ${value}`,
		blockedDomain: (value) => `Email domain is not allowed: ${value}`
	},
	required: () => 'This field is required',
	lettersOnly: (whiteSpaces: boolean) => `This field may contain letters only${whiteSpaces ? '' : ' and must not contain spaces'}`,
	allowedOnly: (value) =>
		value && value.length ? `This field may contain only one of the following values: ${value}` : 'This field has no allowed values',
	sameAs: (value) => `This field must match the ${value} field`,
	notSameAs: (value) => `This field must not match the ${value} field`,
	boolean: {
		base: () => 'This field must be a boolean value',
		expected: (value) => `Expected value: ${value}`
	},
	finite: {
		base: () => 'This field must be a number',
		min: (value) => `The number must be at least ${value}`,
		max: (value) => `The number must be at most ${value}`,
		maxDigitsAfterDot: (value) => `Number of digits after the decimal point must not exceed ${value}`
	},
	number: {
		base: () => 'This field must be an integer',
		min: (value) => `The number must be at least ${value}`,
		max: (value) => `The number must be at most ${value}`
	},
	string: {
		base: () => 'This field must be a string',
		min: (value) => `Minimum string length is ${value}`,
		max: (value) => `Maximum string length is ${value}`
	},
	array: {
		base: () => 'This field must be an array',
		min: (value) => `Minimum array length is ${value}`,
		max: (value) => `Maximum array length is ${value}`
	},
	password: {
		length: (value) => `Minimum password length is ${value}`,
		specialChars: (value) => `Password must contain at least ${value} special character(s)`,
		lowerUpperCasePattern: () => 'Password must contain both uppercase and lowercase letters',
		numbers: (value) => `Password must contain at least ${value} number(s)`
	}
};
