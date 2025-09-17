# Слой домена (Domain)

Слой домена содержит основные компоненты для организации бизнес-логики приложения, включая провайдеры границ, управление событиями, middleware и другие базовые абстракции.

## 🏗️ Основные компоненты

### Boundary Provider (Провайдер границ)

**Файл:** `src/lib/core/shared/boundaryProvider/Provider.ts`

Система управления зависимостями с поддержкой иерархии провайдеров.

#### createBoundaryProvider

Создает провайдер с управлением жизненным циклом сервисов.

```typescript
import { createBoundaryProvider } from '@azure-net/kit';

// Определение типов сервисов
interface InfraServices {
	AuthRepository: () => AuthRepository;
	ScriptRepository: () => ScriptRepository;
}

// Создание провайдера
export const InfrastructureProvider = createBoundaryProvider('InfrastructureProvider', {
	dependsOn: { DatasourceProvider }, // Зависимости от других провайдеров
	register: ({ DatasourceProvider }) => ({
		AuthRepository: () => new AuthRepository(DatasourceProvider.AzureNetRestDatasource),
		ScriptRepository: () => new ScriptRepository(DatasourceProvider.AzureNetRestDatasource)
	}),
	boot: async (services) => {
		// Опциональная функция инициализации
		console.log('Infrastructure Provider загружен');
	}
});
```

#### Особенности:

- **Ленивая инициализация** - сервисы создаются по требованию
- **Кеширование** - каждый сервис создается один раз
- **Зависимости** - автоматическое разрешение зависимостей между провайдерами
- **Контекст** - поддержка серверного и клиентского контекста
- **Очистка** - автоматическая очистка ресурсов

**Пример использования:**

```typescript
// В приложении
const { AuthRepository, ScriptRepository } = InfrastructureProvider();

// Сервисы будут созданы лениво при первом обращении
const users = await AuthRepository.findAll();
```

### Event Bus (Шина событий)

**Файлы:**

- `src/lib/core/shared/eventBus/EventBus.ts`
- `src/lib/core/shared/appEventBus/EventBus.ts`

Система обмена сообщениями между компонентами приложения.

```typescript
import { EventBus } from '@azure-net/kit';

// Создание шины событий
const eventBus = new EventBus();

// Подписка на события
eventBus.on('user:created', (userData) => {
	console.log('Новый пользователь:', userData);
});

// Отправка события
eventBus.emit('user:created', { id: 1, name: 'John' });

// Одноразовая подписка
eventBus.once('app:ready', () => {
	console.log('Приложение готово');
});

// Отписка от события
eventBus.off('user:created', handler);
```

### Class Mirror (Зеркало класса)

**Файлы:**

- `src/lib/core/shared/classMirror/ClassMirror.ts`
- `src/lib/core/shared/classMirror/index.ts`

Утилита для работы с метаданными классов и рефлексией.

```typescript
import { ClassMirror } from '@azure-net/kit';

class UserService {
	constructor(private repository: UserRepository) {}

	async findUser(id: number) {
		return this.repository.findById(id);
	}
}

// Получение метаданных класса
const mirror = new ClassMirror(UserService);

console.log(mirror.name); // 'UserService'
console.log(mirror.methods); // ['constructor', 'findUser']
console.log(mirror.properties); // ['repository']
```

### Middleware

**Файл:** `src/lib/core/shared/middleware/Middleware.ts`

Система middleware для обработки запросов и ответов.

```typescript
import { Middleware } from '@azure-net/kit';

// Создание middleware
const authMiddleware = new Middleware(async (context, next) => {
	// Проверка авторизации
	if (!context.user) {
		throw new Error('Не авторизован');
	}

	// Передача управления следующему middleware
	return await next();
});

// Middleware для логирования
const loggingMiddleware = new Middleware(async (context, next) => {
	console.log('Запрос:', context.request.url);
	const result = await next();
	console.log('Ответ:', result.status);
	return result;
});

// Объединение middleware
const pipeline = authMiddleware.pipe(loggingMiddleware);
```

### Cookie Management (Управление cookie)

**Файл:** `src/lib/core/shared/cookie/UniversalCookie.ts`

Универсальная система работы с cookie для клиента и сервера.

```typescript
import { UniversalCookie } from '@azure-net/kit';

const cookies = new UniversalCookie();

// Установка cookie
cookies.set('token', 'abc123', {
	expires: new Date(Date.now() + 86400000), // 1 день
	httpOnly: true,
	secure: true,
	sameSite: 'strict'
});

// Получение cookie
const token = cookies.get('token');

// Удаление cookie
cookies.remove('token');

// Получение всех cookies
const allCookies = cookies.getAll();
```

## 📝 Примеры использования в приложении

### Создание Application Provider

```typescript
// src/app/contexts/app/Application/Providers/ApplicationProvider.ts
import { createBoundaryProvider } from '$lib/index.js';
import { InfrastructureProvider } from '../../Infrastructure/index.js';
import { AuthService, ScriptService } from '../Services/index.js';

export const ApplicationProvider = createBoundaryProvider('ApplicationProvider', {
	dependsOn: { InfrastructureProvider },
	register: ({ InfrastructureProvider }) => ({
		AuthService: () => new AuthService(InfrastructureProvider.AuthRepository),
		ScriptService: () => new ScriptService(InfrastructureProvider.ScriptRepository)
	})
});
```

### Использование в Server Actions

```typescript
// src/app/contexts/app/Delivery/Auth/Actions.ts
import { createServerAction } from '$lib/index.js';
import { ApplicationProvider } from '../../Application/index.js';

export const LoginAction = createServerAction(async ({ context, utils }) => {
	const { AuthService } = ApplicationProvider();
	const data = await context.request.formData();

	try {
		const res = await AuthService.login(LoginSchema.from(data).json());
		context.cookies.set('token', res.token, { path: '/', httpOnly: false });
		return utils.redirect(301, '/');
	} catch (e) {
		// Обработка ошибок
		throw e;
	}
});
```

## 🎯 Ключевые особенности

1. **Dependency Injection** - автоматическое внедрение зависимостей
2. **Lifecycle Management** - управление жизненным циклом сервисов
3. **Universal Context** - работа на клиенте и сервере
4. **Type Safety** - полная типизация TypeScript
5. **Memory Management** - автоматическая очистка ресурсов

Доменный слой обеспечивает надежную основу для построения масштабируемых приложений с четким разделением ответственности и управлением зависимостями.
