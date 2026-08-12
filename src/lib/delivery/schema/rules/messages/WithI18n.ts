import type { BaseValidationMessages } from './Types.js';

export const validationMessagesI18n: BaseValidationMessages = {
	pattern: () => 'validation.pattern',
	url: {
		base: () => 'validation.url',
		protocol: (value) => ({ key: 'validation.urlProtocol', vars: { value } })
	},
	file: {
		base: () => 'validation.file',
		maxSize: (value) => ({ key: 'validation.fileMaxSize', vars: { value } }),
		mimeType: (value) => ({ key: 'validation.fileMimeType', vars: { value } }),
		extension: (value) => ({ key: 'validation.fileExtension', vars: { value } })
	},
	date: {
		base: () => 'validation.date',
		min: (value) => ({ key: 'validation.dateMin', vars: { value: value instanceof Date ? value.toISOString() : value } }),
		max: (value) => ({ key: 'validation.dateMax', vars: { value: value instanceof Date ? value.toISOString() : value } })
	},
	phone: {
		base: () => 'validation.phone',
		countryCode: () => 'validation.phoneCountryCode',
		minDigits: (value) => ({ key: 'validation.phoneMinDigits', vars: { value } }),
		maxDigits: (value) => ({ key: 'validation.phoneMaxDigits', vars: { value } })
	},
	email: {
		base: () => 'validation.email',
		maxLength: (value) => ({ key: 'validation.emailMaxLength', vars: { value } }),
		allowedDomain: (value) => ({ key: 'validation.emailAllowedDomain', vars: { value } }),
		blockedDomain: (value) => ({ key: 'validation.emailBlockedDomain', vars: { value } })
	},
	required: () => 'validation.required',
	lettersOnly: (whiteSpaces) => (whiteSpaces ? 'validation.lettersOnlyWithWhiteSpaces' : 'validation.lettersOnly'),
	allowedOnly: (value) => ({ key: value && value.length ? 'validation.allowedOnly.base' : 'validation.allowedOnly.nothing', vars: { value } }),
	sameAs: (value) => ({ key: 'validation.sameAs', vars: { value } }),
	notSameAs: (value) => ({ key: 'validation.notSameAs', vars: { value } }),
	boolean: {
		base: () => 'validation.boolean.base',
		expected: (value) => ({ key: 'validation.boolean.expected', vars: { value } })
	},
	finite: {
		base: () => 'validation.finite.base',
		min: (value) => ({ key: 'validation.finite.minLength', vars: { value } }),
		max: (value) => ({ key: 'validation.finite.maxLength', vars: { value } }),
		maxDigitsAfterDot: (value) => ({ key: 'validation.finite.maxDigitsAfterDot', vars: { value } })
	},
	number: {
		base: () => 'validation.number.base',
		min: (value) => ({ key: 'validation.number.minLength', vars: { value } }),
		max: (value) => ({ key: 'validation.number.maxLength', vars: { value } })
	},
	string: {
		base: () => 'validation.string.base',
		min: (value) => ({ key: 'validation.string.minLength', vars: { value } }),
		max: (value) => ({ key: 'validation.string.maxLength', vars: { value } })
	},
	array: {
		base: () => 'validation.array.base',
		min: (value) => ({ key: 'validation.array.minLength', vars: { value } }),
		max: (value) => ({ key: 'validation.array.maxLength', vars: { value } })
	},
	password: {
		length: (value) => ({ key: 'validation.password.length', vars: { value } }),
		specialChars: (value) => ({ key: 'validation.password.specialChars', vars: { value } }),
		lowerUpperCasePattern: () => ({ key: 'validation.password.lowerUpperCasePattern' }),
		numbers: (value) => ({ key: 'validation.password.numbers', vars: { value } })
	}
};
