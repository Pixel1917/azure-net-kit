# Edges: State (Состояние)

Утилиты для управления состоянием приложения, интегрированные с экосистемой edges-svelte.

## 🔄 Управление состоянием

**Файл:** `src/lib/edges/state/index.ts`

Этот модуль предоставляет инструменты для управления состоянием из библиотеки `edges-svelte`, обеспечивая реактивное управление состоянием в Svelte 5 приложениях.

### Основное использование

```typescript
import {} from /* утилиты состояния */ '@azure-net/kit/edges/state';
```

## 📊 Глобальное состояние приложения

Интеграция с Svelte 5 runes для реактивного управления состоянием.

### Создание состояния приложения

```typescript
// src/lib/stores/appState.ts
import { writable } from 'svelte/store';

interface AppState {
	user: User | null;
	theme: 'light' | 'dark';
	notifications: Notification[];
	loading: boolean;
	sidebar: {
		isOpen: boolean;
		activeSection: string;
	};
}

const initialState: AppState = {
	user: null,
	theme: 'light',
	notifications: [],
	loading: false,
	sidebar: {
		isOpen: true,
		activeSection: 'dashboard'
	}
};

export const appState = writable<AppState>(initialState);

// Действия для обновления состояния
export const appActions = {
	setUser: (user: User | null) => {
		appState.update((state) => ({ ...state, user }));
	},

	setTheme: (theme: 'light' | 'dark') => {
		appState.update((state) => ({ ...state, theme }));
		localStorage.setItem('theme', theme);
	},

	addNotification: (notification: Omit<Notification, 'id'>) => {
		const newNotification = {
			...notification,
			id: Date.now().toString()
		};

		appState.update((state) => ({
			...state,
			notifications: [...state.notifications, newNotification]
		}));

		// Автоудаление через 5 секунд
		setTimeout(() => {
			appActions.removeNotification(newNotification.id);
		}, 5000);
	},

	removeNotification: (id: string) => {
		appState.update((state) => ({
			...state,
			notifications: state.notifications.filter((n) => n.id !== id)
		}));
	},

	setLoading: (loading: boolean) => {
		appState.update((state) => ({ ...state, loading }));
	},

	toggleSidebar: () => {
		appState.update((state) => ({
			...state,
			sidebar: {
				...state.sidebar,
				isOpen: !state.sidebar.isOpen
			}
		}));
	},

	setSidebarSection: (activeSection: string) => {
		appState.update((state) => ({
			...state,
			sidebar: {
				...state.sidebar,
				activeSection
			}
		}));
	}
};
```

### Использование в компонентах

```svelte
<!-- App.svelte -->
<script>
	import { appState, appActions } from '$lib/stores/appState';
	import { onMount } from 'svelte';

	// Загрузка темы из localStorage
	onMount(() => {
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			appActions.setTheme(savedTheme);
		}
	});

	// Реактивные переменные
	$: currentUser = $appState.user;
	$: theme = $appState.theme;
	$: notifications = $appState.notifications;
	$: isLoading = $appState.loading;
</script>

<div class="app" data-theme={theme}>
	<header>
		<button onclick={appActions.toggleSidebar}> Меню </button>

		{#if currentUser}
			<span>Привет, {currentUser.name}!</span>
			<button onclick={() => appActions.setUser(null)}> Выйти </button>
		{:else}
			<a href="/login">Войти</a>
		{/if}

		<button onclick={() => appActions.setTheme(theme === 'light' ? 'dark' : 'light')}>
			{theme === 'light' ? '🌙' : '☀️'}
		</button>
	</header>

	<!-- Уведомления -->
	<div class="notifications">
		{#each notifications as notification}
			<div class="notification notification--{notification.type}" onclick={() => appActions.removeNotification(notification.id)}>
				{notification.message}
				<button>×</button>
			</div>
		{/each}
	</div>

	<!-- Загрузочный индикатор -->
	{#if isLoading}
		<div class="loading-overlay">
			<div class="spinner"></div>
		</div>
	{/if}

	<main>
		<slot />
	</main>
</div>
```

## 🎯 Специализированные состояния

### Состояние формы

```typescript
// src/lib/stores/formState.ts
import { writable } from 'svelte/store';

interface FormState<T> {
	data: Partial<T>;
	errors: Record<keyof T, string>;
	touched: Record<keyof T, boolean>;
	dirty: boolean;
	valid: boolean;
	pending: boolean;
}

export function createFormStore<T>(initialData: Partial<T>) {
	const initialState: FormState<T> = {
		data: initialData,
		errors: {} as Record<keyof T, string>,
		touched: {} as Record<keyof T, boolean>,
		dirty: false,
		valid: true,
		pending: false
	};

	const store = writable<FormState<T>>(initialState);

	return {
		subscribe: store.subscribe,

		updateField: (field: keyof T, value: unknown) => {
			store.update((state) => ({
				...state,
				data: { ...state.data, [field]: value },
				touched: { ...state.touched, [field]: true },
				dirty: true
			}));
		},

		setError: (field: keyof T, error: string) => {
			store.update((state) => ({
				...state,
				errors: { ...state.errors, [field]: error },
				valid: false
			}));
		},

		clearError: (field: keyof T) => {
			store.update((state) => {
				const newErrors = { ...state.errors };
				delete newErrors[field];

				return {
					...state,
					errors: newErrors,
					valid: Object.keys(newErrors).length === 0
				};
			});
		},

		setPending: (pending: boolean) => {
			store.update((state) => ({ ...state, pending }));
		},

		reset: () => {
			store.set(initialState);
		}
	};
}
```

### Состояние модальных окон

```typescript
// src/lib/stores/modalState.ts
import { writable } from 'svelte/store';

interface ModalConfig {
	id: string;
	component: any;
	props?: Record<string, unknown>;
	options?: {
		closable?: boolean;
		backdrop?: boolean;
		size?: 'sm' | 'md' | 'lg' | 'xl';
	};
}

interface ModalState {
	modals: ModalConfig[];
	activeModal: string | null;
}

const initialState: ModalState = {
	modals: [],
	activeModal: null
};

const modalStore = writable<ModalState>(initialState);

export const modalActions = {
	open: (config: ModalConfig) => {
		modalStore.update((state) => ({
			...state,
			modals: [...state.modals, config],
			activeModal: config.id
		}));
	},

	close: (id: string) => {
		modalStore.update((state) => {
			const modals = state.modals.filter((m) => m.id !== id);
			const activeModal = modals.length > 0 ? modals[modals.length - 1].id : null;

			return { modals, activeModal };
		});
	},

	closeAll: () => {
		modalStore.set(initialState);
	},

	updateProps: (id: string, props: Record<string, unknown>) => {
		modalStore.update((state) => ({
			...state,
			modals: state.modals.map((modal) => (modal.id === id ? { ...modal, props: { ...modal.props, ...props } } : modal))
		}));
	}
};

export const modalState = {
	subscribe: modalStore.subscribe,
	...modalActions
};
```

## 📡 Состояние данных

### Кеш запросов

```typescript
// src/lib/stores/dataCache.ts
import { writable } from 'svelte/store';

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	expiry: number;
}

interface CacheState {
	entries: Map<string, CacheEntry<unknown>>;
}

const initialState: CacheState = {
	entries: new Map()
};

const cacheStore = writable<CacheState>(initialState);

export const dataCache = {
	subscribe: cacheStore.subscribe,

	set: <T>(key: string, data: T, ttl: number = 300000) => {
		// 5 минут по умолчанию
		const entry: CacheEntry<T> = {
			data,
			timestamp: Date.now(),
			expiry: Date.now() + ttl
		};

		cacheStore.update((state) => {
			const newEntries = new Map(state.entries);
			newEntries.set(key, entry);
			return { entries: newEntries };
		});
	},

	get: <T>(key: string): T | null => {
		let result: T | null = null;

		cacheStore.subscribe((state) => {
			const entry = state.entries.get(key) as CacheEntry<T>;

			if (entry && entry.expiry > Date.now()) {
				result = entry.data;
			} else if (entry) {
				// Удаляем устаревшую запись
				dataCache.delete(key);
			}
		})();

		return result;
	},

	delete: (key: string) => {
		cacheStore.update((state) => {
			const newEntries = new Map(state.entries);
			newEntries.delete(key);
			return { entries: newEntries };
		});
	},

	clear: () => {
		cacheStore.set(initialState);
	},

	cleanup: () => {
		cacheStore.update((state) => {
			const now = Date.now();
			const newEntries = new Map(Array.from(state.entries.entries()).filter(([_, entry]) => entry.expiry > now));
			return { entries: newEntries };
		});
	}
};

// Автоматическая очистка каждые 5 минут
setInterval(() => {
	dataCache.cleanup();
}, 300000);
```

### Состояние пагинации

```typescript
// src/lib/stores/paginationState.ts
import { writable, derived } from 'svelte/store';

interface PaginationState {
	currentPage: number;
	itemsPerPage: number;
	totalItems: number;
	loading: boolean;
}

export function createPaginationStore(initialItemsPerPage: number = 10) {
	const state = writable<PaginationState>({
		currentPage: 1,
		itemsPerPage: initialItemsPerPage,
		totalItems: 0,
		loading: false
	});

	const derived_state = derived(state, ($state) => ({
		...$state,
		totalPages: Math.ceil($state.totalItems / $state.itemsPerPage),
		hasNextPage: $state.currentPage < Math.ceil($state.totalItems / $state.itemsPerPage),
		hasPreviousPage: $state.currentPage > 1,
		startIndex: ($state.currentPage - 1) * $state.itemsPerPage + 1,
		endIndex: Math.min($state.currentPage * $state.itemsPerPage, $state.totalItems)
	}));

	return {
		subscribe: derived_state.subscribe,

		setPage: (page: number) => {
			state.update((s) => ({ ...s, currentPage: page }));
		},

		nextPage: () => {
			state.update((s) => {
				const totalPages = Math.ceil(s.totalItems / s.itemsPerPage);
				return {
					...s,
					currentPage: Math.min(s.currentPage + 1, totalPages)
				};
			});
		},

		previousPage: () => {
			state.update((s) => ({
				...s,
				currentPage: Math.max(s.currentPage - 1, 1)
			}));
		},

		setItemsPerPage: (itemsPerPage: number) => {
			state.update((s) => ({
				...s,
				itemsPerPage,
				currentPage: 1 // Сброс на первую страницу
			}));
		},

		setTotalItems: (totalItems: number) => {
			state.update((s) => ({ ...s, totalItems }));
		},

		setLoading: (loading: boolean) => {
			state.update((s) => ({ ...s, loading }));
		},

		reset: () => {
			state.update((s) => ({
				...s,
				currentPage: 1,
				totalItems: 0
			}));
		}
	};
}
```

## 🔗 Интеграция с AsyncSignal

```svelte
<!-- UsersList.svelte -->
<script>
	import { createAsyncSignal } from '@azure-net/kit';
	import { createPaginationStore } from '$lib/stores/paginationState';
	import { dataCache } from '$lib/stores/dataCache';

	const pagination = createPaginationStore(20);

	// AsyncSignal с интеграцией кеша и пагинации
	const usersSignal = createAsyncSignal(
		async () => {
			const { currentPage, itemsPerPage } = $pagination;
			const cacheKey = `users:${currentPage}:${itemsPerPage}`;

			// Проверяем кеш
			const cachedData = dataCache.get(cacheKey);
			if (cachedData) {
				return cachedData;
			}

			pagination.setLoading(true);

			try {
				const response = await fetch(`/api/users?page=${currentPage}&limit=${itemsPerPage}`);
				const result = await response.json();

				// Обновляем пагинацию
				pagination.setTotalItems(result.total);

				// Сохраняем в кеш
				dataCache.set(cacheKey, result, 60000); // 1 минута

				return result;
			} finally {
				pagination.setLoading(false);
			}
		},
		{
			watch: [() => $pagination.currentPage, () => $pagination.itemsPerPage],
			immediate: true
		}
	);

	// Действия
	const handlePageChange = (newPage) => {
		pagination.setPage(newPage);
	};

	const handleItemsPerPageChange = (newLimit) => {
		pagination.setItemsPerPage(newLimit);
	};
</script>

<div class="users-list">
	<!-- Загрузка -->
	{#if usersSignal.pending}
		<div class="loading">Загрузка пользователей...</div>
	{:else if usersSignal.error}
		<div class="error">Ошибка: {usersSignal.error.message}</div>
	{:else if usersSignal.data}
		<!-- Список пользователей -->
		<div class="users-grid">
			{#each usersSignal.data.users as user}
				<div class="user-card">
					<h3>{user.name}</h3>
					<p>{user.email}</p>
				</div>
			{/each}
		</div>

		<!-- Пагинация -->
		<div class="pagination">
			<select bind:value={$pagination.itemsPerPage} onchange={() => handleItemsPerPageChange($pagination.itemsPerPage)}>
				<option value={10}>10 на странице</option>
				<option value={20}>20 на странице</option>
				<option value={50}>50 на странице</option>
			</select>

			<div class="pagination-info">
				Показано {$pagination.startIndex}-{$pagination.endIndex}
				из {$pagination.totalItems}
			</div>

			<div class="pagination-controls">
				<button onclick={pagination.previousPage} disabled={!$pagination.hasPreviousPage}> ← </button>

				<span>Страница {$pagination.currentPage} из {$pagination.totalPages}</span>

				<button onclick={pagination.nextPage} disabled={!$pagination.hasNextPage}> → </button>
			</div>
		</div>
	{/if}
</div>
```

Управление состоянием через edges-svelte предоставляет мощные и гибкие инструменты для создания реактивных приложений с эффективным управлением данными.
