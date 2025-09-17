# UI Компоненты

Набор утилит и компонентов для создания пользовательского интерфейса, включая маски ввода, модификаторы событий и действия для кликов вне области.

## 🎭 Mask (Маски ввода)

**Файл:** `src/lib/core/ui/mask/Mask.ts`

Система масок для форматирования пользовательского ввода в полях формы.

### Базовые токены

```typescript
import { Mask, masked } from '@azure-net/kit';

// Встроенные токены:
// X - буквы и цифры [0-9a-zA-Z]
// S - только буквы [a-zA-Z]
// A - буквы в верхнем регистре
// a - буквы в нижнем регистре
// # - только цифры [0-9]
// ! - экранирование следующего символа
```

### Использование с HTML элементами

```typescript
// Маска для телефона
const phoneInput = document.getElementById('phone');
masked(phoneInput, '+7 (###) ###-##-##');

// Маска для даты
const dateInput = document.getElementById('date');
masked(dateInput, '##.##.####');

// Маска для кредитной карты
const cardInput = document.getElementById('card');
masked(cardInput, '#### #### #### ####');
```

### Svelte Action для масок

```svelte
<script>
	import { masked } from '@azure-net/kit';

	let phoneValue = '';
	let cardValue = '';
</script>

<!-- Маска телефона -->
<input bind:value={phoneValue} use:masked={'+7 (###) ###-##-##'} placeholder="+7 (___) ___-__-__" />

<!-- Маска кредитной карты -->
<input bind:value={cardValue} use:masked={'#### #### #### ####'} placeholder="____ ____ ____ ____" />
```

### Кастомные токены

```typescript
import { Mask, type Tokens } from '@azure-net/kit';

// Создание кастомных токенов
const customTokens: Tokens = {
	L: {
		pattern: /[a-zA-Zа-яА-Я]/, // Латиница и кириллица
		transform: (v) => v.toUpperCase()
	},
	D: {
		pattern: /[0-9]/
	},
	H: {
		pattern: /[0-9A-Fa-f]/ // Hex символы
	}
};

// Использование кастомных токенов
const input = document.getElementById('custom');
masked(input, 'LL-###-HH', customTokens);

// Результат: AB-123-FF
```

### Динамические маски

```typescript
// Маски для разной длины номеров
const phoneMasks = [
	'+7 (###) ###-##-##', // Российский
	'+1 (###) ###-####', // Американский
	'+## (###) ###-####' // Международный
];

const dynamicMask = Mask.dynamicMask(Mask.maskIt, phoneMasks, Mask.tokens);

// Автоматический выбор маски в зависимости от длины ввода
const input = document.getElementById('phone');
input.oninput = () => {
	input.value = dynamicMask(input.value);
};
```

### Программное форматирование

```typescript
// Без отображения символов маски
const unmasked = Mask.masker('1234567890', '+7 (###) ###-##-##', false);
// Результат: '1234567890'

// С отображением символов маски
const formatted = Mask.masker('1234567890', '+7 (###) ###-##-##', true);
// Результат: '+7 (123) 456-78-90'
```

## ⚡ Event Modifiers (Модификаторы событий)

**Файл:** `src/lib/core/ui/eventModifiers/EventModifiers.ts`

Система модификаторов событий для упрощения обработки пользовательских действий.

### Базовые модификаторы

```svelte
<script>
	import { prevent, stop, once, event } from '@azure-net/kit';

	const handleSubmit = () => {
		console.log('Форма отправлена');
	};

	const handleClick = () => {
		console.log('Кнопка нажата');
	};
</script>

<!-- Предотвратить стандартное поведение -->
<form onsubmit={prevent(handleSubmit)}>
	<button type="submit">Отправить</button>
</form>

<!-- Остановить всплытие события -->
<div onclick={() => console.log('Родительский div')}>
	<button onclick={stop(handleClick)}> Клик не всплывет </button>
</div>

<!-- Выполнить только один раз -->
<button onclick={once(handleClick)}> Сработает только при первом клике </button>
```

### Цепочка модификаторов

```svelte
<script>
	import { event } from '@azure-net/kit';

	const handleButtonClick = () => {
		console.log('Обработчик выполнен');
	};
</script>

<!-- Комбинирование модификаторов -->
<button onclick={event.prevent.stop.once(handleButtonClick)}> Предотвратить + остановить + один раз </button>

<!-- Альтернативный синтаксис -->
<button onclick={event.preventDefault.stopPropagation.once(handleButtonClick)}> Полные названия модификаторов </button>
```

### Доступные модификаторы

```typescript
// Краткие формы
event.prevent; // preventDefault()
event.stop; // stopPropagation()
event.immediate; // stopImmediatePropagation()
event.once; // выполнить только один раз

// Полные формы
event.preventDefault;
event.stopPropagation;
event.stopImmediatePropagation;
```

### Пример с формой

```svelte
<script>
	import { event } from '@azure-net/kit';

	let formData = { email: '', password: '' };

	const submitForm = async () => {
		console.log('Отправка формы:', formData);
		// логика отправки...
	};

	const resetForm = () => {
		formData = { email: '', password: '' };
	};
</script>

<form onsubmit={event.prevent(submitForm)}>
	<input bind:value={formData.email} type="email" />
	<input bind:value={formData.password} type="password" />

	<div class="buttons">
		<button type="submit">Отправить</button>
		<button type="button" onclick={event.prevent.stop(resetForm)}> Сброс </button>
	</div>
</form>
```

## 👆 onClickOutside

**Файл:** `src/lib/core/ui/onClickOutside/OnClickOutside.ts`

Svelte action для обнаружения кликов вне определенного элемента.

### Базовое использование

```svelte
<script>
	import { onClickOutside } from '@azure-net/kit';

	let showDropdown = false;

	const closeDropdown = () => {
		showDropdown = false;
	};
</script>

<div class="dropdown">
	<button onclick={() => (showDropdown = !showDropdown)}> Показать меню </button>

	{#if showDropdown}
		<div class="dropdown-menu" use:onClickOutside on:outside={closeDropdown}>
			<a href="#item1">Пункт 1</a>
			<a href="#item2">Пункт 2</a>
			<a href="#item3">Пункт 3</a>
		</div>
	{/if}
</div>
```

### С кнопкой-инициатором

```svelte
<script>
	import { onClickOutside } from '@azure-net/kit';

	let showModal = false;
	let triggerButton;

	const closeModal = () => {
		showModal = false;
	};
</script>

<button bind:this={triggerButton} onclick={() => (showModal = true)}> Открыть модальное окно </button>

{#if showModal}
	<div class="modal" use:onClickOutside={triggerButton} on:outside={closeModal}>
		<div class="modal-content">
			<h2>Модальное окно</h2>
			<p>Клик вне окна (но не по кнопке) закроет его</p>
		</div>
	</div>
{/if}
```

### Модальное окно

```svelte
<script>
	import { onClickOutside } from '@azure-net/kit';

	let showModal = false;

	const openModal = () => {
		showModal = true;
		document.body.style.overflow = 'hidden';
	};

	const closeModal = () => {
		showModal = false;
		document.body.style.overflow = '';
	};
</script>

<button onclick={openModal}> Открыть модальное окно </button>

{#if showModal}
	<div class="modal-backdrop">
		<div class="modal-dialog" use:onClickOutside on:outside={closeModal}>
			<div class="modal-header">
				<h3>Заголовок</h3>
				<button onclick={closeModal}>&times;</button>
			</div>

			<div class="modal-body">
				<p>Содержимое модального окна</p>
			</div>

			<div class="modal-footer">
				<button onclick={closeModal}>Закрыть</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal-dialog {
		background: white;
		border-radius: 8px;
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		overflow: auto;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #eee;
	}

	.modal-body {
		padding: 1rem;
	}

	.modal-footer {
		padding: 1rem;
		border-top: 1px solid #eee;
		display: flex;
		justify-content: flex-end;
	}
</style>
```

## 🎨 Комплексные примеры

### Поиск с автодополнением

```svelte
<script>
	import { onClickOutside, event } from '@azure-net/kit';
	import { createAsyncSignal } from '@azure-net/kit';

	let query = '';
	let showSuggestions = false;
	let selectedIndex = -1;

	const suggestions = createAsyncSignal(
		async () => {
			if (!query.trim()) return [];
			const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
			return response.json();
		},
		{
			watch: [() => query],
			immediate: false
		}
	);

	const selectSuggestion = (suggestion) => {
		query = suggestion.title;
		showSuggestions = false;
	};

	const handleKeydown = (e) => {
		if (!showSuggestions) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, suggestions.data?.length - 1 || 0);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedIndex >= 0 && suggestions.data?.[selectedIndex]) {
					selectSuggestion(suggestions.data[selectedIndex]);
				}
				break;
			case 'Escape':
				showSuggestions = false;
				selectedIndex = -1;
				break;
		}
	};
</script>

<div class="search-container">
	<input bind:value={query} onkeydown={handleKeydown} onfocus={() => (showSuggestions = true)} placeholder="Поиск..." />

	{#if showSuggestions && suggestions.data?.length}
		<div class="suggestions" use:onClickOutside on:outside={() => (showSuggestions = false)}>
			{#each suggestions.data as suggestion, index}
				<button class="suggestion" class:selected={index === selectedIndex} onclick={event.prevent(() => selectSuggestion(suggestion))}>
					{suggestion.title}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.search-container {
		position: relative;
		width: 100%;
	}

	.suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		z-index: 100;
	}

	.suggestion {
		display: block;
		width: 100%;
		padding: 0.5rem;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
	}

	.suggestion:hover,
	.suggestion.selected {
		background: #f0f0f0;
	}
</style>
```

UI компоненты обеспечивают мощные и гибкие инструменты для создания интерактивных пользовательских интерфейсов с минимальным количеством кода.
