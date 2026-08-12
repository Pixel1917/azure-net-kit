import type { ValidationMessage } from '../../index.js';

export type BaseValidationMessages = {
	pattern: () => ValidationMessage;
	url: {
		base: () => ValidationMessage;
		protocol: (value: string) => ValidationMessage;
	};
	file: {
		base: () => ValidationMessage;
		maxSize: (value: number) => ValidationMessage;
		mimeType: (value: string) => ValidationMessage;
		extension: (value: string) => ValidationMessage;
	};
	date: {
		base: () => ValidationMessage;
		min: (value: Date | string) => ValidationMessage;
		max: (value: Date | string) => ValidationMessage;
	};
	phone: {
		base: () => ValidationMessage;
		countryCode: () => ValidationMessage;
		minDigits: (value: number) => ValidationMessage;
		maxDigits: (value: number) => ValidationMessage;
	};
	email: {
		base: () => ValidationMessage;
		maxLength: (value: number) => ValidationMessage;
		allowedDomain: (value: string) => ValidationMessage;
		blockedDomain: (value: string) => ValidationMessage;
	};
	required: () => ValidationMessage;
	lettersOnly: (whiteSpaces: boolean) => ValidationMessage;
	allowedOnly: (allowed: string) => ValidationMessage;
	sameAs: (value: string) => ValidationMessage;
	notSameAs: (value: string) => ValidationMessage;
	boolean: {
		base: () => ValidationMessage;
		expected: (value: string) => ValidationMessage;
	};
	finite: {
		base: () => ValidationMessage;
		min: (value: number) => ValidationMessage;
		max: (value: number) => ValidationMessage;
		maxDigitsAfterDot: (value: number) => ValidationMessage;
	};
	number: {
		base: () => ValidationMessage;
		min: (value: number) => ValidationMessage;
		max: (value: number) => ValidationMessage;
	};
	string: {
		base: () => ValidationMessage;
		min: (value: number) => ValidationMessage;
		max: (value: number) => ValidationMessage;
	};
	array: {
		base: () => ValidationMessage;
		min: (value: number) => ValidationMessage;
		max: (value: number) => ValidationMessage;
	};
	password: {
		length: (value: number) => ValidationMessage;
		specialChars: (value: number) => ValidationMessage;
		lowerUpperCasePattern: () => ValidationMessage;
		numbers: (value: number) => ValidationMessage;
	};
};
