# Svelte интеграции

Компоненты и утилиты для глубокой интеграции с Svelte 5, включая реактивные сигналы, формы и другие специфичные для Svelte функции.

## 🔄 AsyncSignal

**Файл:** `src/lib/core/svelte/AsyncSignal/AsyncSignal.svelte.ts`

Реактивный сигнал для управления асинхронными операциями с полной интеграцией с Svelte 5.

### Основное использование

```typescript
import { createAsyncSignal } from '@azure-net/kit';

// Простой AsyncSignal
const userSignal = createAsyncSignal(async () => {
  const response = await fetch('/api/user');
  return response.json();
});

// В Svelte компоненте
{#if userSignal.pending}
  <p>Загрузка...</p>
{:else if userSignal.error}
  <p>Ошибка: {userSignal.error.message}</p>
{:else if userSignal.data}
  <p>Привет, {userSignal.data.name}!</p>
{/if}

<button onclick={() => userSignal.refresh()}>
  Обновить
</button>
```

### Расширенные опции

```typescript
const usersSignal = createAsyncSignal(
	async (abortSignal) => {
		const response = await fetch('/api/users', {
			signal: abortSignal
		});
		return response.json();
	},
	{
		immediate: true, // Выполнить сразу при создании
		server: true, // Выполнить на сервере
		initialData: [], // Начальные данные
		key: 'users-list', // Уникальный ключ для управления

		// Реактивные зависимости
		watch: [
			() => searchQuery, // При изменении searchQuery перезапустить
			() => currentPage
		],

		// Коллбэки
		onSuccess: (data) => {
			console.log('Данные загружены:', data);
		},
		onError: (error) => {
			console.error('Ошибка загрузки:', error);
		}
	}
);
```

### Методы управления

```typescript
// Запуск операции
await userSignal.execute();

// Обновление (алиас для execute)
await userSignal.refresh();

// Отмена текущей операции
userSignal.abort();

// Сброс состояния
userSignal.reset();

// Свойства состояния
console.log(userSignal.status); // 'idle' | 'pending' | 'success' | 'error'
console.log(userSignal.pending); // boolean
console.log(userSignal.data); // данные или undefined
console.log(userSignal.error); // ошибка или undefined
```

### Глобальное управление

```typescript
import { refreshAsyncSignal, refreshAllAsyncSignals } from '@azure-net/kit';

// Обновить конкретный сигнал по ключу
await refreshAsyncSignal('users-list');

// Обновить все активные сигналы
await refreshAllAsyncSignals();
```

## 📝 ActiveForm

**Файл:** `src/lib/core/svelte/ActiveForm/ActiveForm.svelte.ts`

Реактивная форма с автоматической валидацией и управлением состоянием.

### Создание формы

```typescript
import { createActiveForm } from '@azure-net/kit';

interface LoginFormData {
	email: string;
	password: string;
	rememberMe: boolean;
}

const loginForm = createActiveForm(
	async (formData) => {
		// Функция отправки должна возвращать AsyncActionResponse
		return await createAsyncAction(() => authService.login(formData), {
			onSuccess: (result) => {
				console.log('Успешный вход');
			}
		});
	},
	{
		initialData: {
			email: '',
			password: '',
			rememberMe: false
		},
		onSuccess: async (response) => {
			// Успешная отправка формы
			goto('/dashboard');
		},
		onError: async () => {
			// Ошибка отправки формы
			console.log('Ошибка входа');
		}
	}
);
```

### Использование в компоненте

```svelte
<script>
	import { createActiveForm } from '@azure-net/kit';

	const form = createActiveForm(submitLogin, {
		initialData: { email: '', password: '' }
	});
</script>

<form onsubmit={form.submit}>
	<div>
		<label for="email">Email:</label>
		<input id="email" type="email" bind:value={form.data.email} class:error={form.errors.email} />
		{#if form.errors.email}
			<span class="error">{form.errors.email}</span>
		{/if}
	</div>

	<div>
		<label for="password">Пароль:</label>
		<input id="password" type="password" bind:value={form.data.password} class:error={form.errors.password} />
		{#if form.errors.password}
			<span class="error">{form.errors.password}</span>
		{/if}
	</div>

	<button type="submit" disabled={form.pending}>
		{form.pending ? 'Загрузка...' : 'Войти'}
	</button>

	<button type="button" onclick={() => form.reset()} disabled={!form.dirty}> Сбросить </button>
</form>

<style>
	.error {
		border-color: red;
	}

	span.error {
		color: red;
		font-size: 0.8em;
	}
</style>
```

### Свойства и методы

```typescript
// Данные формы
form.data.email = 'new@example.com';

// Ошибки валидации
console.log(form.errors); // RequestErrors<FormData>

// Состояния формы
console.log(form.pending); // boolean - отправка в процессе
console.log(form.dirty); // boolean - форма изменилась

// Методы управления
await form.submit(); // Отправить форму
form.reset(); // Очистить форму
form.reset(true); // Сбросить к начальным данным
```

## 🎯 Примеры интеграции

### AsyncSignal в Presenter

```typescript
// src/app/contexts/app/Delivery/Script/ScriptPresenter.ts
import { AppPresenter } from '../../../../core/Presenter/index.js';

export const ScriptPresenter = AppPresenter('ScriptPresenter', ({ createAsyncResource, createAsyncAction }) => {
	const { ScriptService } = ApplicationProvider();

	const collection = createAsyncSignal(
		async () => {
			const result = await createAsyncResource(ScriptService.collection());
			return result;
		},
		{
			immediate: true,
			key: 'scripts-collection'
		}
	);

	const create = async (data: Partial<IScriptCreateRequest>) => {
		return await createAsyncAction(ScriptService.create(CreateScriptSchema.from(data).json()), {
			onSuccess: () => {
				// Обновить коллекцию после создания
				collection.refresh();
			}
		});
	};

	return { collection, create };
});
```

### Форма с валидацией

```typescript
import { createActiveForm } from '@azure-net/kit';
import { LoginSchema } from '../Schema/LoginSchema.js';

const loginForm = createActiveForm(
	async (formData) => {
		// Валидация через схему
		const validatedData = LoginSchema.from(formData).json();

		return await createAsyncAction(() => authService.login(validatedData), {
			onError: (result) => {
				if (result.error.type === 'schema') {
					// Ошибки валидации автоматически попадут в form.errors
				}
			}
		});
	},
	{
		initialData: { email: '', password: '' },
		onSuccess: async () => {
			goto('/dashboard');
		}
	}
);
```

## 🔧 Полезные паттерны

### Кеширование с автообновлением

```typescript
const cachedUsers = createAsyncSignal(
	async () => {
		const users = await userService.getAll();
		localStorage.setItem('users-cache', JSON.stringify(users));
		return users;
	},
	{
		initialData: JSON.parse(localStorage.getItem('users-cache') || '[]'),
		key: 'users-cache'
	}
);

// Автообновление каждые 5 минут
setInterval(
	() => {
		refreshAsyncSignal('users-cache');
	},
	5 * 60 * 1000
);
```

### Условная загрузка

```typescript
let userId = $state(null);

const userProfile = createAsyncSignal(
	async () => {
		if (!userId) throw new Error('No user ID');
		return await userService.getProfile(userId);
	},
	{
		immediate: false, // Не запускать сразу
		watch: [() => userId] // Запускать при изменении userId
	}
);

// При установке userId автоматически загрузится профиль
userId = 123;
```

### Формы с зависимыми полями

```typescript
const orderForm = createActiveForm(submitOrder, {
	initialData: {
		country: '',
		city: '',
		address: ''
	}
});

// Загрузка городов при выборе страны
const cities = createAsyncSignal(
	async () => {
		if (!orderForm.data.country) return [];
		return await locationService.getCities(orderForm.data.country);
	},
	{
		watch: [() => orderForm.data.country],
		immediate: false
	}
);
```

Svelte интеграции обеспечивают мощные инструменты для создания реактивных интерфейсов с минимумом шаблонного кода.
