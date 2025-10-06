### Schema System (Система схем)

**Файл:** `src/lib/core/delivery/schema/Schema.ts`

Мощная система валидации и трансформации данных.

#### Создание схемы

```typescript
import { schema, createSchemaFactory } from '@azure-net/kit';

interface LoginData {
	email: string;
	password: string;
	rememberMe?: boolean;
}

// Базовая схема
const LoginSchema = schema<LoginData>()
	.rules((rules) => ({
		email: [rules.required(), rules.email()],
		password: [rules.required(), rules.minLength(6)]
	}))
	.transform((data) => ({
		...data,
		email: data.email.toLowerCase()
	}))
	.create();

// Использование
const formData = new FormData();
formData.set('email', 'USER@EXAMPLE.COM');
formData.set('password', 'secret123');

try {
	const validData = LoginSchema.from(formData).json();
	// { email: 'user@example.com', password: 'secret123' }
} catch (e) {
	const errors = LoginSchema.getSchemaError(e);
	// { email: 'Поле обязательно' }
}
```

#### Создание фабрики правил

```typescript
import { createSchemaFactory } from '@azure-net/kit';

// Создание переиспользуемых правил
const rules = {
	required:
		() =>
		({ val }) =>
			!val ? 'Поле обязательно' : undefined,
	email:
		() =>
		({ val }) =>
			!/\S+@\S+\.\S+/.test(val) ? 'Неверный формат email' : undefined,
	minLength:
		(min: number) =>
		({ val }) =>
			val.length < min ? `Минимум ${min} символов` : undefined
};

const createAppSchema = createSchemaFactory(rules);

// Использование фабрики
const UserSchema = createAppSchema<UserData>()
	.rules((r) => ({
		name: [r.required()],
		email: [r.required(), r.email()],
		password: [r.required(), r.minLength(8)]
	}))
	.create();
```

#### Расширенные возможности

```typescript
// Кастомные методы
const AdvancedSchema = schema<LoginData>()
	.with(() => ({
		// Добавление кастомных методов
		validateAsync: async (data: Partial<LoginData>) => {
			const instance = AdvancedSchema.from(data);
			const validation = instance.validated();

			if (!validation.valid) {
				throw new Error('Validation failed');
			}

			return validation.json();
		}
	}))
	.create();

// Проверка валидности без исключений
const validation = LoginSchema.from(formData).validated();

if (validation.valid) {
	const data = validation.json();
	// Данные валидны
} else {
	console.log(validation.errors);
	// { email: 'Неверный формат' }
}
```

Создание асинхронного действия с обработкой ошибок.

#### Расширенные возможности

```typescript
const { createAsyncAction } = createAsyncHelpers({
	parseError: customErrorParser
});

const complexAction = await createAsyncAction(
	async () => {
		const step1 = await firstApiCall();
		const step2 = await secondApiCall(step1.id);
		return step2;
	},
	{
		abort: {
			condition: shouldAbort,
			onAbort: () => console.log('Операция отменена')
		},
		beforeSend: async (next, abort) => {
			const canProceed = await checkPermissions();
			if (canProceed) {
				next();
			} else {
				abort();
			}
		},
		reject: true, // Бросать исключения вместо возврата ошибки
		fallbackResponse: defaultValue
	}
);
```
