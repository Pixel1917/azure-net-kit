# Утилиты и хелперы

Дополнительные инструменты и утилиты для повышения продуктивности разработки.

## 🛠️ Tools

**Файл:** `src/lib/tools/index.ts`

Коллекция полезных утилит и инструментов из пакета `@azure-net/kit/tools`.

### Основное использование

```typescript
import {} from /* утилиты */ '@azure-net/kit/tools';
```

## 📋 Константы

**Файлы:**

- `src/lib/core/constants/index.ts`
- `src/lib/core/constants/masks.ts`

### Маски для валидации

```typescript
import { MASKS } from '@azure-net/kit/constants';

// Доступные маски
console.log(MASKS.PHONE);          // Маска телефона
console.log(MASKS.CREDIT_CARD);    // Маска кредитной карты
console.log(MASKS.DATE);           // Маска даты
console.log(MASKS.TIME);           // Маска времени
console.log(MASKS.POSTAL_CODE);    // Почтовый индекс

// Использование с компонентами
<input
  use:masked={MASKS.PHONE}
  placeholder="+7 (___) ___-__-__"
/>
```

### Регулярные выражения

```typescript
import { REGEX } from '@azure-net/kit/constants';

// Валидация email
const isValidEmail = REGEX.EMAIL.test(email);

// Валидация URL
const isValidUrl = REGEX.URL.test(url);

// Валидация номера телефона
const isValidPhone = REGEX.PHONE.test(phone);

// Валидация паролей
const isStrongPassword = REGEX.STRONG_PASSWORD.test(password);
```

## 🎨 Хелперы для UI

### Утилиты классов

```typescript
// src/lib/utils/classNames.ts
export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

// Использование
const buttonClass = cn(
  'btn',
  variant === 'primary' && 'btn-primary',
  disabled && 'btn-disabled',
  size === 'large' && 'btn-lg'
);

<button class={buttonClass}>Click me</button>
```

### Форматирование данных

```typescript
// src/lib/utils/formatters.ts
export const formatters = {
  // Форматирование валюты
  currency: (amount: number, currency = 'RUB'): string => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency
    }).format(amount);
  },

  // Форматирование даты
  date: (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...options
    }).format(dateObj);
  },

  // Форматирование относительного времени
  relativeTime: (date: Date | string): string => {
    const now = new Date();
    const target = typeof date === 'string' ? new Date(date) : date;
    const diffMs = now.getTime() - target.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays} дней назад`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} недель назад`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} месяцев назад`;
    return `${Math.floor(diffDays / 365)} лет назад`;
  },

  // Форматирование размера файла
  fileSize: (bytes: number): string => {
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    if (bytes === 0) return '0 Б';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  },

  // Форматирование номера телефона
  phone: (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('7')) {
      return `+7 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  }
};

// Использование в компонентах
<script>
  import { formatters } from '$lib/utils/formatters';

  const price = 1299.99;
  const createdAt = new Date('2024-01-15');
  const fileSize = 1548576; // bytes
</script>

<div class="product">
  <div class="price">{formatters.currency(price)}</div>
  <div class="date">Создано: {formatters.date(createdAt)}</div>
  <div class="date-relative">{formatters.relativeTime(createdAt)}</div>
  <div class="file-size">Размер: {formatters.fileSize(fileSize)}</div>
</div>
```

## 🔧 Валидационные хелперы

```typescript
// src/lib/utils/validators.ts
export const validators = {
  // Проверка email
  isEmail: (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  // Проверка URL
  isUrl: (value: string): boolean => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  // Проверка российского номера телефона
  isRussianPhone: (value: string): boolean => {
    const phoneRegex = /^(\+7|8)?[\s-]?\(?[489][0-9]{2}\)?[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}$/;
    return phoneRegex.test(value);
  },

  // Проверка силы пароля
  isStrongPassword: (password: string): {
    isValid: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Минимум 8 символов');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Должна быть заглавная буква');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Должна быть строчная буква');
    }

    if (!/\d/.test(password)) {
      errors.push('Должна быть цифра');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Должен быть специальный символ');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Проверка ИНН
  isValidINN: (inn: string): boolean => {
    if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;

    const checkDigit = (inn: string, coefficients: number[]): number => {
      let sum = 0;
      for (let i = 0; i < coefficients.length; i++) {
        sum += parseInt(inn[i]) * coefficients[i];
      }
      return sum % 11 % 10;
    };

    if (inn.length === 10) {
      const coefficients = [2, 4, 10, 3, 5, 9, 4, 6, 8];
      return checkDigit(inn, coefficients) === parseInt(inn[9]);
    } else {
      const coefficients1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
      const coefficients2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

      return checkDigit(inn, coefficients1) === parseInt(inn[10]) &&
             checkDigit(inn, coefficients2) === parseInt(inn[11]);
    }
  }
};

// Интеграция с формами
<script>
  import { validators } from '$lib/utils/validators';
  import { createActiveForm } from '@azure-net/kit';

  const form = createActiveForm(submitForm);

  const validatePassword = (password) => {
    const result = validators.isStrongPassword(password);
    return result.isValid ? null : result.errors.join(', ');
  };
</script>

<input
  bind:value={form.data.password}
  class:error={form.errors.password}
/>

{#if form.data.password}
  {@const validation = validators.isStrongPassword(form.data.password)}
  {#if !validation.isValid}
    <div class="password-errors">
      {#each validation.errors as error}
        <div class="error">{error}</div>
      {/each}
    </div>
  {/if}
{/if}
```

## 🎭 Анимации и переходы

```typescript
// src/lib/utils/transitions.ts
import { cubicOut } from 'svelte/easing';

export const transitions = {
  // Плавное появление
  fadeIn: (node: Element, { delay = 0, duration = 300 } = {}) => {
    return {
      delay,
      duration,
      easing: cubicOut,
      css: (t: number) => `
        opacity: ${t};
        transform: translateY(${(1 - t) * 10}px);
      `
    };
  },

  // Появление сбоку
  slideIn: (node: Element, { delay = 0, duration = 300, direction = 'right' } = {}) => {
    const directions = {
      left: 'translateX(-100%)',
      right: 'translateX(100%)',
      up: 'translateY(-100%)',
      down: 'translateY(100%)'
    };

    return {
      delay,
      duration,
      easing: cubicOut,
      css: (t: number) => `
        transform: ${directions[direction]} scale(${0.8 + 0.2 * t});
        opacity: ${t};
      `
    };
  },

  // Масштабирование
  scale: (node: Element, { delay = 0, duration = 200, start = 0.8 } = {}) => {
    return {
      delay,
      duration,
      easing: cubicOut,
      css: (t: number) => `
        transform: scale(${start + (1 - start) * t});
        opacity: ${t};
      `
    };
  }
};

// Использование в компонентах
<script>
  import { transitions } from '$lib/utils/transitions';

  let visible = false;
</script>

{#if visible}
  <div
    in:fadeIn={{ duration: 300 }}
    out:slideIn={{ direction: 'right', duration: 200 }}
  >
    Контент с анимацией
  </div>
{/if}

<button onclick={() => visible = !visible}>
  Переключить
</button>
```

## 🔄 Хуки и композиции

```typescript
// src/lib/hooks/useLocalStorage.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Получение начального значения
  const storedValue = browser ? localStorage.getItem(key) : null;
  const initial = storedValue ? JSON.parse(storedValue) : initialValue;

  const store = writable<T>(initial);

  // Подписка на изменения для автосохранения
  if (browser) {
    store.subscribe(value => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return {
    subscribe: store.subscribe,
    set: store.set,
    update: store.update,

    // Удаление из localStorage
    remove: () => {
      if (browser) {
        localStorage.removeItem(key);
        store.set(initialValue);
      }
    }
  };
}

// src/lib/hooks/useDebounce.ts
import { writable } from 'svelte/store';

export function useDebounce<T>(initialValue: T, delay: number = 300) {
  const store = writable<T>(initialValue);
  const debouncedStore = writable<T>(initialValue);

  let timeout: ReturnType<typeof setTimeout>;

  store.subscribe(value => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      debouncedStore.set(value);
    }, delay);
  });

  return {
    value: store,
    debouncedValue: debouncedStore,
    set: store.set,
    update: store.update
  };
}

// Использование хуков
<script>
  import { useLocalStorage, useDebounce } from '$lib/hooks';

  // Сохранение настроек в localStorage
  const settings = useLocalStorage('userSettings', {
    theme: 'light',
    language: 'ru'
  });

  // Дебаунс для поиска
  const search = useDebounce('', 500);

  // Реактивный поиск
  $: if ($search.debouncedValue) {
    performSearch($search.debouncedValue);
  }
</script>

<input
  bind:value={$search.value}
  placeholder="Поиск..."
/>

<select bind:value={$settings.theme}>
  <option value="light">Светлая</option>
  <option value="dark">Темная</option>
</select>
```

## 📊 Утилиты для работы с данными

```typescript
// src/lib/utils/dataUtils.ts
export const dataUtils = {
  // Группировка массива
  groupBy: <T>(array: T[], key: keyof T): Record<string, T[]> => {
    return array.reduce((groups, item) => {
      const group = String(item[key]);
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  },

  // Сортировка массива объектов
  sortBy: <T>(array: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] => {
    return [...array].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  },

  // Фильтрация с поиском
  searchFilter: <T>(array: T[], query: string, fields: (keyof T)[]): T[] => {
    const lowerQuery = query.toLowerCase();
    return array.filter(item =>
      fields.some(field =>
        String(item[field]).toLowerCase().includes(lowerQuery)
      )
    );
  },

  // Пагинация
  paginate: <T>(array: T[], page: number, size: number): {
    data: T[];
    total: number;
    totalPages: number;
    currentPage: number;
  } => {
    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;

    return {
      data: array.slice(startIndex, endIndex),
      total: array.length,
      totalPages: Math.ceil(array.length / size),
      currentPage: page
    };
  },

  // Удаление дублей
  unique: <T>(array: T[], key?: keyof T): T[] => {
    if (!key) return [...new Set(array)];

    const seen = new Set();
    return array.filter(item => {
      const value = item[key];
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
};

// Использование
<script>
  import { dataUtils } from '$lib/utils/dataUtils';

  let users = [
    { id: 1, name: 'Alice', role: 'admin', age: 30 },
    { id: 2, name: 'Bob', role: 'user', age: 25 },
    { id: 3, name: 'Charlie', role: 'admin', age: 35 }
  ];

  let searchQuery = '';
  let sortField = 'name';
  let sortDirection = 'asc';

  $: filteredUsers = dataUtils.searchFilter(
    users,
    searchQuery,
    ['name', 'role']
  );

  $: sortedUsers = dataUtils.sortBy(
    filteredUsers,
    sortField,
    sortDirection
  );

  $: groupedUsers = dataUtils.groupBy(sortedUsers, 'role');
</script>

<input bind:value={searchQuery} placeholder="Поиск пользователей..." />

{#each Object.entries(groupedUsers) as [role, roleUsers]}
  <div class="role-group">
    <h3>{role} ({roleUsers.length})</h3>
    {#each roleUsers as user}
      <div class="user">{user.name} - {user.age} лет</div>
    {/each}
  </div>
{/each}
```

Утилиты и хелперы обеспечивают богатый набор инструментов для повышения продуктивности разработки и создания качественного пользовательского опыта.
