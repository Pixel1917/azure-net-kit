# Слой приложения (Application)

Слой приложения отвечает за координацию взаимодействия между различными частями системы, обработку пользовательских действий, валидацию данных и управление асинхронными операциями.

## 🎯 Основные компоненты

### Server Actions

**Файл:** `src/lib/core/delivery/serverAction/CreateServerAction.ts`

Создание серверных действий для обработки форм и запросов.

#### createServerAction

Создает серверное действие с доступом к контексту SvelteKit.

```typescript
import { createServerAction } from '@azure-net/kit';

export const LoginAction = createServerAction(async ({ context, utils }) => {
	const { fail, redirect, error } = utils;
	const data = await context.request.formData();

	try {
		// Бизнес-логика
		const result = await authService.login(credentials);
		context.cookies.set('token', result.token, {
			path: '/',
			httpOnly: false
		});
		return redirect(301, '/dashboard');
	} catch (e) {
		return fail(422, { errors: { message: 'Неверные данные' } });
	}
});
```

**Параметры:**

- `context` - Объект RequestEvent из SvelteKit
- `utils` - Утилиты: fail, redirect, error

**Особенности:**

- Работает только на сервере
- Автоматический доступ к контексту запроса
- Интеграция с SvelteKit actions

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

### Error Handling (Обработка ошибок)

**Файл:** `src/lib/core/delivery/injectableDependencies/ErrorHandler.ts`

Унифицированная система обработки ошибок.

```typescript
import { createErrorParser, type AppError } from '@azure-net/kit';

// Базовый парсер ошибок
const errorParser = createErrorParser();

try {
	await someApiCall();
} catch (error) {
	const appError: AppError = errorParser(error);

	switch (appError.type) {
		case 'http':
			console.log(`HTTP ошибка: ${appError.status} - ${appError.message}`);
			break;
		case 'schema':
			console.log('Ошибка валидации:', appError.fields);
			break;
		case 'app':
			console.log('Ошибка приложения:', appError.message);
			break;
	}
}
```

#### Кастомный парсер ошибок

```typescript
interface CustomErrorData {
	code: string;
	details: string;
}

const customErrorParser = createErrorParser<CustomErrorData>({
	parseHttpError: (error) => ({
		type: 'http',
		message: `API Error: ${error.message}`,
		status: error.status,
		custom: {
			code: error.data?.code || 'UNKNOWN',
			details: error.data?.details || 'No details'
		},
		original: error
	})
});
```

### Async Helpers (Асинхронные помощники)

**Файл:** `src/lib/core/delivery/injectableDependencies/AsyncHelpers.ts`

Утилиты для работы с асинхронными операциями.

#### createAsyncAction

Создание асинхронного действия с обработкой ошибок.

```typescript
import { createAsyncHelpers } from '@azure-net/kit';

const { createAsyncAction, createAsyncResource } = createAsyncHelpers();

// Асинхронное действие
const loginAction = async (credentials: LoginData) => {
	return await createAsyncAction(() => authService.login(credentials), {
		beforeSend: async (next, abort) => {
			if (!navigator.onLine) {
				abort();
				return;
			}
			next();
		},
		onSuccess: (result) => {
			console.log('Успешный вход:', result.response);
		},
		onError: (result) => {
			console.log('Ошибка входа:', result.error);
		},
		fallbackResponse: null
	});
};

// Использование
const result = await loginAction({ email: 'user@test.com', password: 'pass' });

if (result.success) {
	console.log('Пользователь:', result.response);
} else {
	console.log('Ошибка:', result.error);
}
```

#### createAsyncResource

Создание асинхронного ресурса.

```typescript
// Загрузка данных
const loadUsers = async () => {
	return await createAsyncResource(() => userService.getAll(), {
		onError: (error) => {
			console.error('Ошибка загрузки пользователей:', error);
		},
		fallbackResponse: []
	});
};

// Результат всегда возвращается, даже при ошибке
const users = await loadUsers(); // [] если ошибка
```

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

## 📝 Примеры использования в приложении

### Server Action с валидацией

```typescript
// src/app/contexts/app/Delivery/Auth/Actions.ts
import { createServerAction } from '$lib/index.js';
import { ApplicationProvider } from '../../Application/index.js';
import { LoginSchema } from './Schema/index.js';

export const LoginAction = createServerAction(async ({ context, utils }) => {
	const { AuthService } = ApplicationProvider();
	const { fail, redirect } = utils;
	const data = await context.request.formData();

	try {
		const validatedData = LoginSchema.from(data).json();
		const res = await AuthService.login(validatedData);

		context.cookies.set('token', res.token, {
			path: '/',
			httpOnly: false
		});

		return redirect(301, '/');
	} catch (e) {
		const schemaErrors = LoginSchema.getSchemaError(e);
		if (schemaErrors) {
			return fail(422, { errors: schemaErrors });
		}
		throw e;
	}
});
```

### Presenter с асинхронными операциями

```typescript
// src/app/contexts/app/Delivery/Script/ScriptPresenter.ts
export const ScriptPresenter = AppPresenter('ScriptPresenter', ({ createAsyncResource, createAsyncAction }) => {
	const { ScriptService } = ApplicationProvider();

	const collection = async () => await createAsyncResource(ScriptService.collection());

	const create = async (request: Partial<IScriptCreateRequest>) =>
		await createAsyncAction(ScriptService.create(CreateScriptSchema.from(request).json()), {
			onSuccess: () => {
				// Уведомление об успехе
			}
		});

	return { collection, create };
});
```

## 🎯 Ключевые особенности

1. **Унифицированная обработка ошибок** - все ошибки приводятся к единому формату
2. **Валидация данных** - мощная система схем с поддержкой трансформации
3. **Асинхронные операции** - упрощенная работа с промисами и обработкой ошибок
4. **Server Actions** - интеграция с SvelteKit для серверных действий
5. **Type Safety** - полная типизация TypeScript на всех уровнях

Слой приложения обеспечивает связующее звено между пользовательским интерфейсом и бизнес-логикой, предоставляя удобные инструменты для валидации, обработки ошибок и выполнения асинхронных операций.
