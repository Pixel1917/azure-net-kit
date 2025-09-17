# Edges: Context (Контекст)

Система управления контекстом запросов для универсального доступа к данным на сервере и клиенте.

## 🌐 RequestContext

**Файл:** `src/lib/edges/context/index.ts`

RequestContext предоставляет универсальный доступ к контексту запроса, используя библиотеку `edges-svelte/context`.

### Основное использование

```typescript
import { RequestContext } from '@azure-net/kit/edges/context';

// Получение текущего контекста
const context = RequestContext.current();

// Доступ к данным запроса
console.log(context.event); // RequestEvent из SvelteKit
console.log(context.data); // Пользовательские данные
console.log(context.requestId); // Уникальный ID запроса
```

### В Server Actions

```typescript
import { createServerAction } from '@azure-net/kit';
import { RequestContext } from '@azure-net/kit/edges/context';

export const MyAction = createServerAction(async ({ context }) => {
	// Доступ через параметр
	console.log('URL:', context.url.pathname);
	console.log('User:', context.locals.user);

	// Или через RequestContext
	const requestContext = RequestContext.current();
	console.log('Event:', requestContext.event);
	console.log('Custom data:', requestContext.data);

	// Сохранение данных в контексте
	requestContext.data.customValue = 'some value';

	return { success: true };
});
```

### В Boundary Providers

```typescript
import { createBoundaryProvider } from '@azure-net/kit';
import { RequestContext } from '@azure-net/kit/edges/context';

export const DatabaseProvider = createBoundaryProvider('DatabaseProvider', {
	register: () => ({
		UserRepository: () => {
			const context = RequestContext.current();

			// Доступ к пользователю из locals
			const currentUser = context.event?.locals.user;

			return new UserRepository(currentUser?.tenantId);
		}
	})
});
```

## 💾 Управление данными контекста

### Сохранение и извлечение данных

```typescript
import { RequestContext } from '@azure-net/kit/edges/context';

// В начале обработки запроса
const context = RequestContext.current();

// Сохранение пользовательских данных
context.data.userId = user.id;
context.data.permissions = userPermissions;
context.data.startTime = Date.now();

// В другой части приложения
const sameContext = RequestContext.current();
console.log('User ID:', sameContext.data.userId);
console.log('Permissions:', sameContext.data.permissions);
```

### Кеширование в контексте

```typescript
// Провайдер с кешированием на уровне запроса
export const CacheProvider = createBoundaryProvider('CacheProvider', {
	register: () => ({
		RequestCache: () => {
			const context = RequestContext.current();

			if (!context.data.cache) {
				context.data.cache = new Map();
			}

			return {
				get: (key: string) => context.data.cache.get(key),
				set: (key: string, value: any) => context.data.cache.set(key, value),
				has: (key: string) => context.data.cache.has(key),
				clear: () => context.data.cache.clear()
			};
		}
	})
});

// Использование кеша запроса
const { RequestCache } = CacheProvider();

const cachedUserData = RequestCache.get(`user:${userId}`);
if (!cachedUserData) {
	const userData = await loadUserData(userId);
	RequestCache.set(`user:${userId}`, userData);
	return userData;
}
return cachedUserData;
```

## 🔐 Аутентификация и авторизация

### Доступ к пользователю

```typescript
import { RequestContext } from '@azure-net/kit/edges/context';

// В любом месте серверного кода
const getCurrentUser = () => {
	const context = RequestContext.current();
	return context.event?.locals.user;
};

// В провайдере
export const AuthProvider = createBoundaryProvider('AuthProvider', {
	register: () => ({
		CurrentUser: () => {
			const context = RequestContext.current();
			return context.event?.locals.user || null;
		},

		AuthGuard: () => ({
			requireAuth: () => {
				const user = getCurrentUser();
				if (!user) {
					throw new Error('Authentication required');
				}
				return user;
			},

			requireRole: (role: string) => {
				const user = getCurrentUser();
				if (!user || !user.roles.includes(role)) {
					throw new Error(`Role '${role}' required`);
				}
				return user;
			}
		})
	})
});
```

### Middleware для аутентификации

```typescript
// hooks.server.ts
import { RequestContext } from '@azure-net/kit/edges/context';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Получение токена
	const token = event.cookies.get('auth-token');

	if (token) {
		try {
			const user = await validateToken(token);
			event.locals.user = user;
		} catch (error) {
			console.error('Token validation failed:', error);
		}
	}

	return await resolve(event);
};

// В любом server action или load функции
export const UserAction = createServerAction(async () => {
	const context = RequestContext.current();
	const user = context.event?.locals.user;

	if (!user) {
		throw new Error('Not authenticated');
	}

	return { user };
});
```

## 🌍 Передача данных между компонентами

### Глобальное состояние запроса

```typescript
// Провайдер для глобального состояния запроса
export const RequestStateProvider = createBoundaryProvider('RequestState', {
	register: () => ({
		State: () => {
			const context = RequestContext.current();

			if (!context.data.state) {
				context.data.state = {
					notifications: [],
					breadcrumbs: [],
					pageTitle: '',
					metadata: {}
				};
			}

			return {
				// Уведомления
				addNotification: (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
					context.data.state.notifications.push({ message, type, id: Date.now() });
				},

				getNotifications: () => context.data.state.notifications,

				clearNotifications: () => {
					context.data.state.notifications = [];
				},

				// Хлебные крошки
				setBreadcrumbs: (breadcrumbs: Array<{ title: string; href?: string }>) => {
					context.data.state.breadcrumbs = breadcrumbs;
				},

				addBreadcrumb: (breadcrumb: { title: string; href?: string }) => {
					context.data.state.breadcrumbs.push(breadcrumb);
				},

				getBreadcrumbs: () => context.data.state.breadcrumbs,

				// Заголовок страницы
				setPageTitle: (title: string) => {
					context.data.state.pageTitle = title;
				},

				getPageTitle: () => context.data.state.pageTitle,

				// Метаданные
				setMetadata: (key: string, value: any) => {
					context.data.state.metadata[key] = value;
				},

				getMetadata: (key: string) => context.data.state.metadata[key]
			};
		}
	})
});
```

### Использование в load функциях

```typescript
// src/routes/users/+page.server.ts
import { RequestStateProvider } from '$lib/providers';

export const load = async ({ params }) => {
	const { State } = RequestStateProvider();

	// Установка хлебных крошек
	State.setBreadcrumbs([
		{ title: 'Главная', href: '/' },
		{ title: 'Пользователи', href: '/users' }
	]);

	// Установка заголовка
	State.setPageTitle('Список пользователей');

	// Добавление метаданных
	State.setMetadata('lastUpdate', new Date().toISOString());

	return {
		breadcrumbs: State.getBreadcrumbs(),
		pageTitle: State.getPageTitle(),
		users: await getUsersData()
	};
};
```

## 🛠️ Утилиты контекста

### Создание хелперов для контекста

```typescript
import { RequestContext } from '@azure-net/kit/edges/context';

// Хелперы для работы с контекстом
export const ContextHelpers = {
	// Получение IP адреса
	getClientIP: () => {
		const context = RequestContext.current();
		const event = context.event;

		return event?.getClientAddress() || event?.request.headers.get('x-forwarded-for') || event?.request.headers.get('x-real-ip') || 'unknown';
	},

	// Получение User-Agent
	getUserAgent: () => {
		const context = RequestContext.current();
		return context.event?.request.headers.get('user-agent') || 'unknown';
	},

	// Проверка мобильного устройства
	isMobile: () => {
		const userAgent = ContextHelpers.getUserAgent();
		return /Mobile|Android|iPhone|iPad/.test(userAgent);
	},

	// Получение языка
	getPreferredLanguage: () => {
		const context = RequestContext.current();
		const acceptLanguage = context.event?.request.headers.get('accept-language');
		return acceptLanguage?.split(',')[0] || 'en';
	},

	// Логирование с контекстом
	logWithContext: (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
		const context = RequestContext.current();
		console[level]({
			message,
			data,
			requestId: context.requestId,
			url: context.event?.url.pathname,
			userAgent: ContextHelpers.getUserAgent(),
			ip: ContextHelpers.getClientIP()
		});
	}
};
```

### Debugging и мониторинг

```typescript
// Провайдер для мониторинга
export const MonitoringProvider = createBoundaryProvider('Monitoring', {
	register: () => ({
		RequestMonitor: () => {
			const context = RequestContext.current();
			const startTime = Date.now();

			// Сохранение времени начала запроса
			context.data.monitoring = {
				startTime,
				events: []
			};

			return {
				logEvent: (eventName: string, data?: any) => {
					context.data.monitoring.events.push({
						name: eventName,
						timestamp: Date.now(),
						duration: Date.now() - startTime,
						data
					});
				},

				getStats: () => ({
					totalDuration: Date.now() - startTime,
					events: context.data.monitoring.events,
					requestId: context.requestId
				})
			};
		}
	})
});

// Использование в действиях
export const MonitoredAction = createServerAction(async () => {
	const { RequestMonitor } = MonitoringProvider();

	RequestMonitor.logEvent('action_start');

	try {
		const result = await someAsyncOperation();
		RequestMonitor.logEvent('operation_complete', { resultSize: result.length });

		return result;
	} catch (error) {
		RequestMonitor.logEvent('error', { error: error.message });
		throw error;
	} finally {
		const stats = RequestMonitor.getStats();
		console.log('Request stats:', stats);
	}
});
```

RequestContext обеспечивает мощную основу для управления состоянием запросов и передачи данных между различными компонентами серверного приложения.
