# Схемы и валидация

Мощная система валидации данных с поддержкой правил, трансформации и интеграции с формами.

## 🔧 Система правил валидации

**Файлы:**

- `src/lib/core/delivery/schema/rules/Rules.ts`
- `src/lib/core/delivery/schema/rules/messages/`

### Встроенные правила

```typescript
import { Rules } from '@azure-net/kit/schema';

// Доступные правила валидации
const rules = Rules();

// Основные правила
rules.required(); // Обязательное поле
rules.email(); // Email формат
rules.min(5); // Минимальное значение
rules.max(100); // Максимальное значение
rules.minLength(3); // Минимальная длина
rules.maxLength(50); // Максимальная длина
rules.pattern(/^\d+$/); // Регулярное выражение
rules.url(); // URL формат
rules.numeric(); // Только числа
rules.integer(); // Только целые числа
rules.positive(); // Положительные числа
rules.negative(); // Отрицательные числа
rules.between(1, 100); // Значение в диапазоне
```

### Кастомные правила

```typescript
import { createSchemaFactory, type ValidationRuleResult } from '@azure-net/kit';

// Создание кастомного правила
const customRules = {
	// Правило для проверки силы пароля
	strongPassword:
		(): ValidationRuleResult<string> =>
		({ val }) => {
			if (!val) return undefined;

			const hasUpper = /[A-Z]/.test(val);
			const hasLower = /[a-z]/.test(val);
			const hasDigit = /\d/.test(val);
			const hasSpecial = /[!@#$%^&*]/.test(val);
			const minLength = val.length >= 8;

			if (!hasUpper) return 'Пароль должен содержать заглавную букву';
			if (!hasLower) return 'Пароль должен содержать строчную букву';
			if (!hasDigit) return 'Пароль должен содержать цифру';
			if (!hasSpecial) return 'Пароль должен содержать специальный символ';
			if (!minLength) return 'Пароль должен быть не менее 8 символов';

			return undefined;
		},

	// Правило для проверки совпадения паролей
	confirmPassword:
		(originalField: string): ValidationRuleResult<string, any> =>
		({ val, listValues }) => {
			const originalValue = listValues?.[originalField];
			return val !== originalValue ? 'Пароли не совпадают' : undefined;
		},

	// Правило для проверки уникальности email
	uniqueEmail:
		(): ValidationRuleResult<string> =>
		async ({ val }) => {
			if (!val) return undefined;

			const response = await fetch(`/api/check-email?email=${val}`);
			const { exists } = await response.json();

			return exists ? 'Email уже используется' : undefined;
		}
};
```

### Интернационализация сообщений

```typescript
// Русские сообщения
const ruMessages = {
	required: 'Поле обязательно для заполнения',
	email: 'Введите корректный email',
	minLength: (min: number) => `Минимум ${min} символов`,
	maxLength: (max: number) => `Максимум ${max} символов`
};

// Английские сообщения
const enMessages = {
	required: 'This field is required',
	email: 'Please enter a valid email',
	minLength: (min: number) => `Minimum ${min} characters`,
	maxLength: (max: number) => `Maximum ${max} characters`
};

// Создание правил с локализацией
const createRulesWithMessages = (locale: 'ru' | 'en') => {
	const messages = locale === 'ru' ? ruMessages : enMessages;

	return {
		required:
			() =>
			({ val }) =>
				!val ? messages.required : undefined,
		email:
			() =>
			({ val }) => {
				if (!val) return undefined;
				return !/\S+@\S+\.\S+/.test(val) ? messages.email : undefined;
			},
		minLength:
			(min: number) =>
			({ val }) => {
				if (!val) return undefined;
				return val.length < min ? messages.minLength(min) : undefined;
			}
	};
};
```

## 📋 Создание и использование схем

### Базовая схема

```typescript
import { schema } from '@azure-net/kit';

interface UserData {
	name: string;
	email: string;
	age: number;
	bio?: string;
}

const UserSchema = schema<UserData>()
	.rules((rules) => ({
		name: [rules.required(), rules.minLength(2), rules.maxLength(50)],
		email: [rules.required(), rules.email()],
		age: [rules.required(), rules.numeric(), rules.min(18), rules.max(120)],
		bio: [rules.maxLength(500)]
	}))
	.create();

// Использование
const formData = new FormData();
formData.set('name', 'John Doe');
formData.set('email', 'john@example.com');
formData.set('age', '25');

try {
	const userData = UserSchema.from(formData).json();
	console.log('Валидные данные:', userData);
} catch (error) {
	const errors = UserSchema.getSchemaError(error);
	console.log('Ошибки валидации:', errors);
}
```

### Схема с трансформацией

```typescript
interface RawUserData {
	firstName: string;
	lastName: string;
	email: string;
	birthDate: string;
}

interface TransformedUserData {
	fullName: string;
	email: string;
	age: number;
	isAdult: boolean;
}

const UserTransformSchema = schema<RawUserData>()
	.rules((rules) => ({
		firstName: [rules.required()],
		lastName: [rules.required()],
		email: [rules.required(), rules.email()],
		birthDate: [rules.required()]
	}))
	.transform((data): TransformedUserData => {
		const birthDate = new Date(data.birthDate);
		const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

		return {
			fullName: `${data.firstName} ${data.lastName}`,
			email: data.email.toLowerCase(),
			age,
			isAdult: age >= 18
		};
	})
	.create();

const result = UserTransformSchema.from({
	firstName: 'John',
	lastName: 'Doe',
	email: 'JOHN@EXAMPLE.COM',
	birthDate: '1990-01-01'
}).json();

console.log(result);
// {
//   fullName: 'John Doe',
//   email: 'john@example.com',
//   age: 34,
//   isAdult: true
// }
```

### Схема с кастомными методами

```typescript
const AdvancedUserSchema = schema<UserData>()
	.rules((rules) => ({
		email: [rules.required(), rules.email()],
		password: [rules.required(), customRules.strongPassword()]
	}))
	.with(() => ({
		// Асинхронная валидация
		validateAsync: async (data: Partial<UserData>) => {
			const instance = AdvancedUserSchema.from(data);
			const validation = instance.validated();

			if (!validation.valid) {
				throw new ValidationError(validation.errors);
			}

			// Дополнительные асинхронные проверки
			const emailExists = await checkEmailExists(data.email);
			if (emailExists) {
				throw new ValidationError({
					email: 'Email уже используется'
				});
			}

			return validation.json();
		},

		// Частичная валидация
		validateField: (field: keyof UserData, value: unknown) => {
			const tempData = { [field]: value };
			const instance = AdvancedUserSchema.from(tempData);
			const validation = instance.validated();

			return validation.errors[field];
		}
	}))
	.create();
```

## 🏭 Фабрика схем

```typescript
import { createSchemaFactory } from '@azure-net/kit';

// Создание переиспользуемых правил
const appRules = {
	required:
		() =>
		({ val }) =>
			!val ? 'Поле обязательно' : undefined,
	email:
		() =>
		({ val }) => {
			if (!val) return undefined;
			return !/\S+@\S+\.\S+/.test(val) ? 'Неверный формат email' : undefined;
		},
	phone:
		() =>
		({ val }) => {
			if (!val) return undefined;
			return !/^\+7\d{10}$/.test(val) ? 'Неверный формат телефона' : undefined;
		},
	minLength:
		(min: number) =>
		({ val }) => {
			if (!val) return undefined;
			return val.length < min ? `Минимум ${min} символов` : undefined;
		}
};

const createAppSchema = createSchemaFactory(appRules);

// Использование фабрики
const LoginSchema = createAppSchema<{
	email: string;
	password: string;
}>()
	.rules((r) => ({
		email: [r.required(), r.email()],
		password: [r.required(), r.minLength(6)]
	}))
	.create();

const ContactSchema = createAppSchema<{
	name: string;
	email: string;
	phone: string;
}>()
	.rules((r) => ({
		name: [r.required()],
		email: [r.required(), r.email()],
		phone: [r.required(), r.phone()]
	}))
	.create();
```

## 📝 Интеграция с формами

### Svelte форма с валидацией

```svelte
<script>
	import { createActiveForm } from '@azure-net/kit';
	import { UserSchema } from './schemas/UserSchema.js';

	const form = createActiveForm(
		async (formData) => {
			try {
				// Валидация через схему
				const validatedData = UserSchema.from(formData).json();

				// Отправка данных
				return await createAsyncAction(() => userService.create(validatedData));
			} catch (error) {
				// Ошибки валидации автоматически обработаются
				throw error;
			}
		},
		{
			initialData: {
				name: '',
				email: '',
				age: ''
			}
		}
	);

	// Валидация отдельного поля
	const validateField = (field, value) => {
		try {
			const tempData = { [field]: value };
			UserSchema.from(tempData).validated();
			return null;
		} catch (error) {
			const errors = UserSchema.getSchemaError(error);
			return errors?.[field];
		}
	};
</script>

<form onsubmit={form.submit}>
	<div class="field">
		<label for="name">Имя:</label>
		<input
			id="name"
			bind:value={form.data.name}
			class:error={form.errors.name}
			on:blur={() => {
				const error = validateField('name', form.data.name);
				if (error) {
					form.errors.name = error;
				}
			}}
		/>
		{#if form.errors.name}
			<span class="error">{form.errors.name}</span>
		{/if}
	</div>

	<div class="field">
		<label for="email">Email:</label>
		<input id="email" type="email" bind:value={form.data.email} class:error={form.errors.email} />
		{#if form.errors.email}
			<span class="error">{form.errors.email}</span>
		{/if}
	</div>

	<button type="submit" disabled={form.pending}>
		{form.pending ? 'Создание...' : 'Создать пользователя'}
	</button>
</form>
```

### Server Action с валидацией

```typescript
// src/app/contexts/app/Delivery/User/Actions.ts
import { createServerAction } from '@azure-net/kit';
import { UserSchema } from './Schema/UserSchema.js';
import { ApplicationProvider } from '../../Application/index.js';

export const CreateUserAction = createServerAction(async ({ context, utils }) => {
	const { UserService } = ApplicationProvider();
	const { fail, redirect } = utils;

	const data = await context.request.formData();

	try {
		// Валидация через схему
		const validatedData = UserSchema.from(data).json();

		// Создание пользователя
		const user = await UserService.create(validatedData);

		return redirect(301, `/users/${user.id}`);
	} catch (error) {
		// Проверка на ошибку валидации
		const schemaErrors = UserSchema.getSchemaError(error);
		if (schemaErrors) {
			return fail(422, { errors: schemaErrors });
		}

		// Другие ошибки
		throw error;
	}
});
```

## 🔄 Асинхронная валидация

```typescript
const AsyncUserSchema = schema<UserData>()
	.rules((rules) => ({
		email: [
			rules.required(),
			rules.email(),
			// Асинхронная проверка уникальности
			async ({ val }) => {
				if (!val) return undefined;

				const response = await fetch(`/api/check-email`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: val })
				});

				const { exists } = await response.json();
				return exists ? 'Email уже используется' : undefined;
			}
		]
	}))
	.with(() => ({
		validateAsync: async (data: Partial<UserData>) => {
			const instance = AsyncUserSchema.from(data);

			// Синхронная валидация
			const syncValidation = instance.validated();
			if (!syncValidation.valid) {
				throw new SchemaFail(syncValidation.errors);
			}

			// Асинхронная валидация
			const asyncErrors = {};

			if (data.email) {
				const emailError = await rules.checkUniqueEmail(data.email);
				if (emailError) {
					asyncErrors.email = emailError;
				}
			}

			if (Object.keys(asyncErrors).length > 0) {
				throw new SchemaFail(asyncErrors);
			}

			return syncValidation.json();
		}
	}))
	.create();
```

Система схем и валидации обеспечивает надежную основу для проверки данных на всех уровнях приложения с поддержкой сложных правил валидации и удобной интеграцией с UI.
