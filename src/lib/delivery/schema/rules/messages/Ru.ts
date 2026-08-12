import type { BaseValidationMessages } from './Types.js';

export const validationMessagesRu: BaseValidationMessages = {
	pattern: () => 'Значение не соответствует требуемому формату',
	url: {
		base: () => 'Неверный формат URL',
		protocol: (value) => `Протокол URL должен быть одним из: ${value}`
	},
	file: {
		base: () => 'Поле должно содержать файл',
		maxSize: (value) => `Размер файла не должен превышать ${value} байт`,
		mimeType: (value) => `Тип файла должен быть одним из: ${value}`,
		extension: (value) => `Расширение файла должно быть одним из: ${value}`
	},
	date: {
		base: () => 'Неверный формат даты',
		min: (value) => `Дата должна быть не раньше ${value instanceof Date ? value.toISOString() : value}`,
		max: (value) => `Дата должна быть не позже ${value instanceof Date ? value.toISOString() : value}`
	},
	phone: {
		base: () => 'Неверный формат номера телефона',
		countryCode: () => 'Номер телефона должен содержать международный код страны',
		minDigits: (value) => `Номер телефона должен содержать не менее ${value} цифр`,
		maxDigits: (value) => `Номер телефона должен содержать не более ${value} цифр`
	},
	email: {
		base: () => 'Невалидный email',
		maxLength: (value) => `Email не должен быть длиннее ${value} символов`,
		allowedDomain: (value) => `Домен email должен быть одним из: ${value}`,
		blockedDomain: (value) => `Домен email запрещен: ${value}`
	},
	required: () => 'Поле обязательно к заполнению',
	lettersOnly: (whiteSpaces: boolean) => `Поле может содержать только буквы ${whiteSpaces ? '' : 'и не должно содержать пробелы'}`,
	allowedOnly: (value) =>
		value && value.length ? `Поле может содержать только одно из следующих значений:: ${value}` : 'Поле не имеет допустимых значений',
	sameAs: (value) => `Поле должно совпадать с полем ${value}`,
	notSameAs: (value) => `Поле не должно совпадать с полем ${value}`,
	boolean: {
		base: () => 'Поле должно содержать значение типа boolean',
		expected: (value) => `Ожидаемое значение поля - ${value}`
	},
	finite: {
		base: () => 'Поле должно быть числом',
		min: (value) => `Число должно быть не менее ${value}`,
		max: (value) => `Число должно быть не более ${value}`,
		maxDigitsAfterDot: (value) => `Количество символов после точки не более ${value}`
	},
	number: {
		base: () => 'Поле должно быть целым числом',
		min: (value) => `Число должно быть не менее ${value}`,
		max: (value) => `Число должно быть не более ${value}`
	},
	string: {
		base: () => 'Поле должно быть строкой',
		min: (value) => `Минимальная длина строки - ${value}`,
		max: (value) => `Максимальная длина строки - ${value}`
	},
	array: {
		base: () => 'Поле должно быть массивом',
		min: (value) => `Минимальная длина массива - ${value}`,
		max: (value) => `Максимальная длина массива - ${value}`
	},
	password: {
		length: (value) => `Минимальная длина пароля - ${value}`,
		specialChars: (value) => `В пароле должно быть спецсимволы в количестве не менее ${value}`,
		lowerUpperCasePattern: () => 'В пароле должны быть буквы верхнего и нижнего регистра',
		numbers: (value) => `В пароле должно быть цифры в количестве не менее ${value}`
	}
};
