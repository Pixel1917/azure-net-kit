### 1. [P1] Асинхронные client middleware не гарантированно останавливают навигацию

[`App.ts:363`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/shared/app/App.ts#L363) регистрирует асинхронный callback через `beforeNavigate`:

```ts
beforeNavigate(async (navigation) => {
	await executeClientMiddlewares(internalMiddlewares, navigation);
});
```

При этом [`ClientMiddleware.ts:29`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/shared/app/middleware/ClientMiddleware.ts#L29) разрешает ожидать middleware перед `cancel()`.

По актуальному контракту SvelteKit callback `beforeNavigate` возвращает `void`; SvelteKit не обязан ожидать его Promise. Для ожидаемой навигации предназначен `onNavigate`, который официально поддерживает Promise. [Документация `$app/navigation`](https://svelte.dev/docs/kit/%24app-navigation).

Последствие: синхронный guard работает, но такой middleware потенциально пропустит переход:

```ts
async ({ next }) => {
	await checkAuth();
	// Решение принято уже после начала navigation.
};
```

Это главный поведенческий дефект пакета.

Рекомендация: либо запретить асинхронные client middleware типами, либо строить async-flow через `onNavigate`.

---

### 7. [P1] `AsyncSignal` может сохранить отклонённый Promise навсегда

[`AsyncSignal.svelte.ts:111`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/svelte/async-signal/AsyncSignal.svelte.ts#L111) вызывает `beforeSend` до входа в `try/finally`.

Если `beforeSend` выбросит ошибку, очистка в [`AsyncSignal.svelte.ts:149`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/svelte/async-signal/AsyncSignal.svelte.ts#L149) не выполнится.

После этого [`AsyncSignal.svelte.ts:163`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/svelte/async-signal/AsyncSignal.svelte.ts#L163) продолжит находить `currentPromise` и ожидать тот же отклонённый Promise вместо нового запуска.

Рекомендация: включить `beforeSend` и stale-проверку в общий `try/finally`.

---

### 8. [P1] Abort может оставить `AsyncSignal` в `pending`

[`AsyncSignal.svelte.ts:119`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/svelte/async-signal/AsyncSignal.svelte.ts#L119) устанавливает `pending`.

При `AbortError` выполнение выходит через [`AsyncSignal.svelte.ts:135`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/svelte/async-signal/AsyncSignal.svelte.ts#L135), но статус не восстанавливается.

Если после abort не запускается новый запрос, UI может навсегда увидеть `pending === true`.

---

### 9. [P1] `rules.required()` может упасть на SSR из-за `File`

[`Rules.ts:394`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/delivery/schema/rules/Rules.ts#L394):

```ts
if (val instanceof File && val.size < 1)
```

В Node/runtime без глобального `File` само обращение к `File` создаёт `ReferenceError`.

Нужно сначала проверять:

```ts
typeof File !== 'undefined';
```

Либо использовать browser-neutral file-like guard.

---

### 10. [P1] CLI выполняет TS-конфиг через `new Function` и молча теряет настройки

[`loadConfig.ts:21`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-cli/src/utils/loadConfig.ts#L21) преобразует `export default` в `return`, после чего вызывает `new Function`.

Не поддерживаются надёжно:

- импорты;
- TypeScript-аннотации;
- `satisfies`;
- `defineConfig(...)`;
- вычисляемые зависимости;
- обычный реальный TS-модуль.

Любая ошибка молча превращается в пустой конфиг в [`loadConfig.ts:30`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-cli/src/utils/loadConfig.ts#L30) и [`loadConfig.ts:65`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-cli/src/utils/loadConfig.ts#L65).

Для генератора это опасно: он может продолжить работу с неправильными aliases/contexts вместо понятного падения.

## Средний Приоритет

### 11. [P2] HTTP retry работает противоположно наиболее ожидаемой семантике

[`HttpServiceInstance.ts:278`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/infra/http-service/HttpServiceInstance.ts#L278) повторяет все `External` ошибки.

В `External` при этом попадают HTTP-статусы `400`, `401`, `403`, `404`, `500`.

Результат:

- клиентские ошибки повторяются;
- настоящий `fetch failed` сначала остаётся обычным `Error`;
- network error нормализуется уже после retry-loop и может не повториться.

Нужен отдельный `retryOn` или политика по status/error: обычно повторяют network errors, `408`, `425`, `429`, отдельные `5xx`, но не все `4xx`.

---

### 13. [P2] Boot провайдера помечается завершённым до фактического завершения

[`Provider.ts:207`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/shared/boundary-provider/Provider.ts#L207):

```ts
setBootFlag(name, true);
const bootResult = boot(providerProxy);
```

Если `boot()` синхронно бросит ошибку или его Promise отклонится, boot всё равно останется отмеченным. Асинхронный boot также не блокирует получение сервисов.

Если это сознательный fire-and-forget контракт, его нужно жёстко документировать. Иначе флаг стоит устанавливать после успешного завершения.

---

### 21. [P2] CLI checks пропускают некоторые формы импортов

[`checkLayerBoundaries.ts:21`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-cli/src/checks/checkLayerBoundaries.ts#L21) не видит side-effect imports:

```ts
import '$other-context/bootstrap';
```

Также не покрыт обычный:

```ts
export * from '$other-context/domain';
```

[`checkImports.ts:83`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-cli/src/checks/checkImports.ts#L83) проверяет static imports, но не запрещает `.js/.ts` внутри dynamic import:

```ts
await import('./module.js');
```

То есть архитектурные checks полезны, но пока не являются строгой гарантией границ.

---

### 22. [P2] CLI runtime может расходиться с TypeScript-кодом

[`package.json:5`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-cli/package.json#L5) запускает `bin/azure-net.js`, а рядом хранится параллельный TS-код.

В пакете находятся десятки пар `.ts`/`.js`, но нет обязательного `prepack`, который гарантирует компиляцию перед публикацией.

Дополнительно [`azure-net.ts:8`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-cli/bin/azure-net.ts#L8) сообщает версию `4.1.0`, тогда как package version уже `5.1.1`.

---

### 23. [P2] CLI rest-route и `ensureRoute` имеют несовместимый контракт

Генератор превращает `[...rest]` в `{rest}`, но [`Shared.ts:22`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/shared/app/middleware/Shared.ts#L22) считает каждый placeholder ровно одним сегментом.

Поэтому:

```text
/docs/{rest}
```

совпадёт с `/docs/a`, но не совпадёт с `/docs/a/b/c`.

Нужно сохранять различие между `[id]`, `[[id]]` и `[...rest]` в генерируемом формате.

### `@azure-net/ui-kit`

SSR-поведение хорошее:

- manager не создаёт DOM на сервере;
- `show()` до mount явно падает;
- browser timers защищены `BROWSER`;
- SSR render тесты присутствуют.

Оставшиеся ограничения:

- singleton manager рассчитан на один mounted container;
- duplicate notification ID может сломать keyed `{#each}` между [`NotificationStore.svelte.ts:47`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-ui-kit/src/lib/widgets/Notification/NotificationStore.svelte.ts#L47) и [`NotificationContainer.svelte:94`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-ui-kit/src/lib/widgets/Notification/NotificationContainer.svelte#L94);
- `destroyAll()` не очищает timeout каждого notification;
- `{@html}` на [`NotificationContainer.svelte:60`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-ui-kit/src/lib/widgets/Notification/NotificationContainer.svelte#L60) требует доверенного/санитизированного контента.

### `@azure-net/cli`

Функционально CLI уже мощный, но это самый рискованный production-пакет.

Главная причина: **ноль автоматических тестов** для большого codegen/checker-пакета. Typecheck и lint не проверяют, что генераторы создают правильную структуру, импорты и валидный код.

Нужны snapshot/integration tests во временных каталогах для каждой команды.

## Приоритет Перед Новыми Фичами

1. Исправить async client middleware.
2. Закрыть оба зависания `AsyncSignal`.
3. Обработать empty HTTP responses и пересмотреть retry policy.
4. Добавить SSR-safe guard для `File`.
5. Расширить Edges serialization и CSP.
6. Добавить поддержку `export function load`.
7. Зафиксировать совместимый диапазон SvelteKit и добавить plugin integration matrix.
8. Добавить тестовую инфраструктуру CLI.
9. Синхронизировать test-stand с Kit 5.x.
10. После этого обновить документацию по фактическому API.
