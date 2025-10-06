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

## 🎯 Ключевые особенности

1. **Dependency Injection** - автоматическое внедрение зависимостей
2. **Lifecycle Management** - управление жизненным циклом сервисов
3. **Universal Context** - работа на клиенте и сервере
4. **Type Safety** - полная типизация TypeScript
5. **Memory Management** - автоматическая очистка ресурсов

Доменный слой обеспечивает надежную основу для построения масштабируемых приложений с четким разделением ответственности и управлением зависимостями.
