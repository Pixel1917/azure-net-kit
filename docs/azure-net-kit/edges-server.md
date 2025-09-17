# Edges: Server (Сервер)

Утилиты и компоненты для серверной интеграции с SvelteKit.

## 🚀 Серверная интеграция

**Файл:** `src/lib/edges/server/index.ts`

Этот модуль предоставляет серверные утилиты из библиотеки `edges-svelte`, обеспечивая бесшовную интеграцию с SvelteKit.

### Основное использование

```typescript
import {} from /* серверные утилиты */ '@azure-net/kit/edges/server';
```

## 🔧 Server Actions интеграция

Интеграция с SvelteKit server actions через `createServerAction`.

### Базовый пример

```typescript
// src/routes/auth/+page.server.ts
import { createServerAction } from '@azure-net/kit';
import { ApplicationProvider } from '$lib/providers';

export const actions = {
	login: createServerAction(async ({ context, utils }) => {
		const { AuthService } = ApplicationProvider();
		const { fail, redirect } = utils;

		const data = await context.request.formData();
		const email = data.get('email') as string;
		const password = data.get('password') as string;

		try {
			const result = await AuthService.login({ email, password });

			// Установка cookie
			context.cookies.set('auth-token', result.token, {
				path: '/',
				httpOnly: true,
				secure: true,
				maxAge: 60 * 60 * 24 * 7 // 7 дней
			});

			return redirect(302, '/dashboard');
		} catch (error) {
			return fail(400, {
				error: 'Неверные учетные данные'
			});
		}
	}),

	logout: createServerAction(async ({ context, utils }) => {
		const { redirect } = utils;

		// Удаление cookie
		context.cookies.delete('auth-token', { path: '/' });

		// Очистка locals
		context.locals.user = undefined;

		return redirect(302, '/login');
	})
};
```

### CRUD операции

```typescript
// src/routes/users/+page.server.ts
import { createServerAction } from '@azure-net/kit';
import { UserSchema } from '$lib/schemas';
import { ApplicationProvider } from '$lib/providers';

export const actions = {
	create: createServerAction(async ({ context, utils }) => {
		const { UserService } = ApplicationProvider();
		const { fail, redirect } = utils;

		const data = await context.request.formData();

		try {
			// Валидация через схему
			const userData = UserSchema.from(data).json();

			// Создание пользователя
			const user = await UserService.create(userData);

			return redirect(302, `/users/${user.id}`);
		} catch (error) {
			// Обработка ошибок валидации
			const schemaErrors = UserSchema.getSchemaError(error);
			if (schemaErrors) {
				return fail(422, { errors: schemaErrors });
			}

			return fail(500, { error: 'Ошибка создания пользователя' });
		}
	}),

	update: createServerAction(async ({ context, utils }) => {
		const { UserService } = ApplicationProvider();
		const { fail } = utils;

		const data = await context.request.formData();
		const id = parseInt(data.get('id') as string);

		try {
			const userData = UserSchema.from(data).json();
			await UserService.update(id, userData);

			return { success: true };
		} catch (error) {
			const schemaErrors = UserSchema.getSchemaError(error);
			if (schemaErrors) {
				return fail(422, { errors: schemaErrors });
			}

			return fail(500, { error: 'Ошибка обновления' });
		}
	}),

	delete: createServerAction(async ({ context, utils }) => {
		const { UserService } = ApplicationProvider();
		const { fail } = utils;

		const data = await context.request.formData();
		const id = parseInt(data.get('id') as string);

		try {
			await UserService.delete(id);
			return { success: true };
		} catch (error) {
			return fail(500, { error: 'Ошибка удаления' });
		}
	})
};
```

## 📋 Load функции интеграция

Использование провайдеров в load функциях.

### Server Load функции

```typescript
// src/routes/dashboard/+layout.server.ts
import { ApplicationProvider, RequestStateProvider } from '$lib/providers';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const { UserService } = ApplicationProvider();
	const { State } = RequestStateProvider();

	// Получение текущего пользователя
	const currentUser = locals.user;

	if (currentUser) {
		// Получение дополнительных данных пользователя
		const userProfile = await UserService.getProfile(currentUser.id);

		// Установка хлебных крошек
		State.setBreadcrumbs([
			{ title: 'Главная', href: '/' },
			{ title: 'Панель управления', href: '/dashboard' }
		]);

		return {
			user: userProfile,
			breadcrumbs: State.getBreadcrumbs()
		};
	}

	// Редирект на логин если не авторизован
	throw redirect(302, '/login');
};
```

### Параметризированные Load функции

```typescript
// src/routes/users/[id]/+page.server.ts
import { ApplicationProvider } from '$lib/providers';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { UserService, PermissionService } = ApplicationProvider();

	const userId = parseInt(params.id);
	const currentUser = locals.user;

	// Проверка прав доступа
	const canViewUser = await PermissionService.canViewUser(currentUser.id, userId);
	if (!canViewUser) {
		throw error(403, 'Недостаточно прав');
	}

	try {
		const user = await UserService.getById(userId);
		const userStats = await UserService.getStats(userId);

		return {
			user,
			stats: userStats
		};
	} catch (err) {
		throw error(404, 'Пользователь не найден');
	}
};
```

## 🛡️ Middleware и Guards

### Аутентификация Middleware

```typescript
// hooks.server.ts
import { AuthProvider } from '$lib/providers';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Получение токена из cookie
	const token = event.cookies.get('auth-token');

	if (token) {
		try {
			const { AuthService } = AuthProvider();
			const user = await AuthService.validateToken(token);
			event.locals.user = user;
		} catch (error) {
			console.error('Token validation failed:', error);
			// Удаление невалидного токена
			event.cookies.delete('auth-token', { path: '/' });
		}
	}

	// CORS заголовки для API
	if (event.url.pathname.startsWith('/api')) {
		if (event.request.method === 'OPTIONS') {
			return new Response(null, {
				status: 200,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization'
				}
			});
		}
	}

	const response = await resolve(event);

	// Добавление CORS заголовков
	if (event.url.pathname.startsWith('/api')) {
		response.headers.append('Access-Control-Allow-Origin', '*');
	}

	return response;
};
```

### Route Guards

```typescript
// src/lib/guards/auth.guard.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const requireAuth: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		// Сохранение URL для редиректа после входа
		const redirectTo = url.pathname + url.search;
		throw redirect(302, `/login?redirect=${encodeURIComponent(redirectTo)}`);
	}

	return {
		user: locals.user
	};
};

export const requireRole = (role: string) => {
	const guard: LayoutServerLoad = async ({ locals }) => {
		if (!locals.user) {
			throw redirect(302, '/login');
		}

		if (!locals.user.roles.includes(role)) {
			throw error(403, `Требуется роль: ${role}`);
		}

		return {
			user: locals.user
		};
	};

	return guard;
};

// Использование в layout
// src/routes/admin/+layout.server.ts
export const load = requireRole('admin');
```

## 📡 API Routes

### RESTful API endpoints

```typescript
// src/routes/api/users/+server.ts
import { json, error } from '@sveltejs/kit';
import { ApplicationProvider } from '$lib/providers';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { UserService } = ApplicationProvider();

	// Проверка авторизации для API
	if (!locals.user) {
		throw error(401, 'Требуется авторизация');
	}

	// Параметры запроса
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const search = url.searchParams.get('search') || '';

	try {
		const result = await UserService.paginate({
			page,
			limit,
			search
		});

		return json({
			data: result.data,
			pagination: {
				page: result.page,
				totalPages: result.totalPages,
				total: result.total
			}
		});
	} catch (err) {
		console.error('Error fetching users:', err);
		throw error(500, 'Ошибка получения пользователей');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { UserService } = ApplicationProvider();

	if (!locals.user) {
		throw error(401, 'Требуется авторизация');
	}

	try {
		const userData = await request.json();

		// Валидация через схему
		const validatedData = UserSchema.from(userData).json();

		const user = await UserService.create(validatedData);

		return json({ data: user }, { status: 201 });
	} catch (err) {
		const schemaErrors = UserSchema.getSchemaError(err);
		if (schemaErrors) {
			throw error(422, { message: 'Ошибка валидации', errors: schemaErrors });
		}

		console.error('Error creating user:', err);
		throw error(500, 'Ошибка создания пользователя');
	}
};
```

### Параметризированные API routes

```typescript
// src/routes/api/users/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import { ApplicationProvider } from '$lib/providers';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { UserService } = ApplicationProvider();

	if (!locals.user) {
		throw error(401, 'Требуется авторизация');
	}

	const userId = parseInt(params.id);

	try {
		const user = await UserService.getById(userId);
		return json({ data: user });
	} catch (err) {
		throw error(404, 'Пользователь не найден');
	}
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { UserService } = ApplicationProvider();

	if (!locals.user) {
		throw error(401, 'Требуется авторизация');
	}

	const userId = parseInt(params.id);

	try {
		const userData = await request.json();
		const validatedData = UserSchema.from(userData).json();

		const updatedUser = await UserService.update(userId, validatedData);

		return json({ data: updatedUser });
	} catch (err) {
		const schemaErrors = UserSchema.getSchemaError(err);
		if (schemaErrors) {
			throw error(422, { message: 'Ошибка валидации', errors: schemaErrors });
		}

		throw error(500, 'Ошибка обновления пользователя');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { UserService } = ApplicationProvider();

	if (!locals.user) {
		throw error(401, 'Требуется авторизация');
	}

	const userId = parseInt(params.id);

	try {
		await UserService.delete(userId);
		return json({ success: true });
	} catch (err) {
		throw error(500, 'Ошибка удаления пользователя');
	}
};
```

## 🔒 Безопасность

### CSRF Protection

```typescript
// hooks.server.ts
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// CSRF защита для форм
	if (event.request.method === 'POST' && !dev) {
		const contentType = event.request.headers.get('content-type');

		if (contentType?.includes('application/x-www-form-urlencoded')) {
			const origin = event.request.headers.get('origin');
			const host = event.request.headers.get('host');

			if (!origin || !host || new URL(origin).host !== host) {
				throw error(403, 'CSRF token mismatch');
			}
		}
	}

	return resolve(event);
};
```

### Rate Limiting

```typescript
// src/lib/middleware/rateLimiter.ts
import { error } from '@sveltejs/kit';

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export const rateLimit = (maxRequests: number, windowMs: number) => {
	return (identifier: string) => {
		const now = Date.now();
		const windowStart = now - windowMs;

		const current = rateLimitMap.get(identifier);

		if (!current || current.resetTime < windowStart) {
			rateLimitMap.set(identifier, { count: 1, resetTime: now });
			return;
		}

		if (current.count >= maxRequests) {
			throw error(429, 'Слишком много запросов');
		}

		current.count++;
	};
};

// Использование в API route
export const POST: RequestHandler = async ({ getClientAddress, locals }) => {
	const limiter = rateLimit(5, 60000); // 5 запросов в минуту

	const clientIP = getClientAddress();
	const userId = locals.user?.id;
	const identifier = userId ? `user:${userId}` : `ip:${clientIP}`;

	limiter(identifier);

	// Остальная логика...
};
```

Серверная интеграция обеспечивает мощные инструменты для создания безопасных и производительных серверных приложений на SvelteKit.
