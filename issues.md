**Общий Вердикт**
Экосистема уже сильная и архитектурно заметно выше среднего, особенно по request-scoped DI, типизации и производительности. Но «идеальной» и безусловно production-ready связку пока назвать нельзя.

Критических `P0`-проблем и очевидных межзапросных утечек данных я не нашёл. Основные риски находятся в интеграционном слое SvelteKit, асинхронной клиентской навигации, сериализации Edges и нескольких краевых состояниях `AsyncSignal`/HTTP.

Итоговая оценка экосистемы: **7.3/10**.

## Критичные Находки

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

### 2. [P1] Edges не поддерживает полный набор сериализуемых Svelte-значений

[`State.svelte.ts:22`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edge-s/src/lib/store/State.svelte.ts#L22) и [`State.svelte.ts:54`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edge-s/src/lib/store/State.svelte.ts#L54) используют `JSON.stringify` с собственными маркерами.

Поддержаны:

- `undefined`;
- `null`;
- `BigInt`;
- обычные объекты и массивы.

Проблемные типы:

- `Date` становится строкой;
- `Map` и `Set` превращаются в пустые объекты;
- `URL` теряет прототип;
- циклические объекты падают;
- пользовательские классы теряют прототип;
- несколько ссылок на один объект становятся независимыми объектами.

Это уже слабее современного контракта Svelte/devalue. Официальный `hydratable` поддерживает `Map`, `Set`, `URL`, `BigInt` и Promise. [Документация `hydratable`](https://svelte.dev/docs/svelte/hydratable).

Рекомендация: перейти на `devalue` либо явно ограничить `createState<T>` типом сериализуемых значений и документировать контракт.

---

### 3. [P1] SSR-сериализация Edges несовместима со строгим CSP

[`State.svelte.ts:61`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edge-s/src/lib/store/State.svelte.ts#L61) генерирует обычный inline `<script>` без nonce/hash.

[`EdgesHandle.ts:47`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edge-s/src/lib/server/EdgesHandle.ts#L47) внедряет этот скрипт перед `</body>`.

Экранирование содержимого сделано хорошо: обработаны `<`, `>`, `&`, кавычки и Unicode-разделители. XSS-инъекция через сериализованное значение выглядит закрытой. Но при строгом CSP браузер просто запретит выполнение скрипта, и SSR-state не попадёт в клиентскую гидратацию.

Svelte для `hydratable` отдельно предусматривает nonce/hash. [Раздел CSP](https://svelte.dev/docs/svelte/hydratable#CSP).

Рекомендация: поддержать nonce из SvelteKit CSP или перейти на инфраструктуру Svelte hydration.

---

### 4. [P1] Плагин AzureNetKit зависит от приватной структуры `.svelte-kit`

[`AzureNetPlugin.ts:353`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/plugin/AzureNetPlugin.ts#L353) патчит сгенерированные внутренние файлы SvelteKit регулярными выражениями. Ниже используются конкретные имена внутренних модулей и фрагментов кода.

При этом peer dependency допускает любую версию:

```json
"@sveltejs/kit": ">=2.16.0"
```

Это слишком широкий контракт для плагина, который знает внутреннее устройство конкретной версии SvelteKit. Изменение `.svelte-kit/generated/server/internal.js` в будущей версии может привести не к понятной ошибке, а к тихому исчезновению request context.

Рекомендации:

1. Ограничить проверенный диапазон SvelteKit.
2. Добавить матрицу интеграционных тестов по нескольким версиям.
3. После трансформации проверять обязательные маркеры и падать, если внедрение не произошло.
4. По возможности минимизировать патчинг приватных файлов.

---

### 5. [P1] Валидная декларация `export function load` не оборачивается Edges

[`EdgesAutoHandlePlugin.ts:93`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edge-s/src/lib/plugin/EdgesAutoHandlePlugin.ts#L93) распознаёт exported variable и отдельный export declaration, но не `FunctionDeclaration`.

Regex fallback также рассчитан только на:

```ts
export const load = ...
```

Это означает, что валидный SvelteKit-код:

```ts
export async function load() {
	return {};
}
```

не получит Edges wrapping. Такая же логика скопирована в плагин AzureNetKit.

Рекомендация: добавить обработку `ts.isFunctionDeclaration` и интеграционный тест для `export function load`.

---

### 6. [P1] `HttpServiceInstance` превращает нормальный пустой ответ в ошибку

[`HttpServiceInstance.ts:235`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/infra/http-service/HttpServiceInstance.ts#L235) по умолчанию всегда вызывает `response.json()`.

[`HttpServiceInstance.ts:287`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/infra/http-service/HttpServiceInstance.ts#L287) превращает ошибку парсинга успешного ответа в `HttpServiceError Internal`.

Поэтому нормальные ответы:

- `204 No Content`;
- `205 Reset Content`;
- успешный `HEAD`;
- успешный ответ с `Content-Length: 0`;

могут завершиться ошибкой.

Рекомендация: до парсинга учитывать status, method и отсутствие body.

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

### 12. [P2] `ActiveForm` теряет `Date`, `File`, `Map`, `Set`

[`ActiveForm.svelte.ts:83`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/svelte/active-form/ActiveForm.svelte.ts#L83) использует `ObjectUtil.deepClone(initial)`.

Но [`ObjectUtil.ts:24`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-tools/src/objectUtil/ObjectUtil.ts#L24) по умолчанию клонирует через JSON:

- `Date` становится строкой;
- `File` превращается в `{}`;
- `undefined` исчезает;
- `Map` и `Set` теряются.

Это особенно заметно, потому что Schema официально умеет работать с файлами. Для обычных JSON-форм всё хорошо; для богатых форм контракт сейчас небезопасен.

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

### 14. [P2] `ServerInit` фактически запускается при первом request

[`AzureNetPlugin.ts:235`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/plugin/AzureNetPlugin.ts#L235) экспортирует пустой официальный `init`, а [`AzureNetPlugin.ts:237`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit/src/lib/plugin/AzureNetPlugin.ts#L237) вызывает `register.serverInit()` внутри `handle`.

Это не межзапросная утечка: глобальный WeakMap гарантирует один вызов. Но семантика отличается от официального `ServerInit`, который запускается при инициализации сервера. [Документация hooks](https://svelte.dev/docs/kit/hooks).

Риски:

- initialization error возникает только на первом запросе;
- callback получает доступ к DI внутри контекста первого request;
- флаг ставится до завершения callback;
- настоящий startup health-check не видит ошибку заранее.

---

### 15. [P2] `createApp` пока не полностью заменяет SvelteKit hooks

Плагин запрещает пользовательские `hooks.server/client`, но не предоставляет полноценные аналоги для:

- `handleFetch`;
- `handleValidationError`;
- `reroute`;
- `transport`.

Если это сознательно ограниченный API, документация должна говорить «замена поддерживаемого подмножества hooks», а не полная замена.

---

### 16. [P2] Edges требует Node runtime, но это не закреплено контрактом

[`EdgesHandle.ts:2`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edge-s/src/lib/server/EdgesHandle.ts#L2) напрямую импортирует:

```ts
node: async_hooks;
node: crypto;
```

Для Node adapter это правильное и быстрое решение. Но package/runtime contract не ограничивает пакет Node-средой. На Cloudflare Workers и других edge runtimes это может не запуститься без Node compatibility.

SSR-safety на Node: высокая. SSR-portability: ограниченная.

---

### 19. [P2] Prefix translations не разделяет request locals

[`edges-svelte-translations/index.ts:31`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edges-svelte-translations/src/lib/index.ts#L31) использует prefix для имени store.

Но серверные значения всё равно всегда сохраняются в:

```ts
event.locals.lang;
event.locals.translations;
```

на [`index.ts:64`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edges-svelte-translations/src/lib/index.ts#L64).

Несколько TranslationManager с разными prefix будут использовать одинаковые locals и могут подхватить сообщения друг друга. Prefix сейчас создаёт уникальность Edges-store, но не полноценную изоляцию менеджеров.

---

### 20. [P2] Парсинг `Accept-Language` слишком упрощён

Менеджер берёт первый элемент заголовка и первые два символа языка.

Не учитываются:

- `q=`;
- `pt-BR`;
- `zh-Hans`;
- порядок предпочтений;
- fallback по полному locale и базовому языку.

Для `en/ru` достаточно, для заявленной универсальной i18n-системы пока ограниченно.

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

## Сильные Стороны SSR

### AzureNetKit

SSR-изоляция самого DI сделана хорошо.

- `BoundaryProvider` хранит server cache в `RequestContext`, а не в module-global map.
- Конструирование сервисов ленивое.
- Cycle stack находится в request context.
- Client cache отделён через `BROWSER`.
- App lifecycle server callbacks получают текущий request context.
- `AppEvents` на сервере опирается на Edges presenter и не является обычным глобальным singleton.
- `AsyncHelpers` хранит пользовательский error parser в request context.
- HTTP на сервере использует fetch текущего `RequestEvent`, сохраняя cookies, relative URL и SvelteKit semantics.

Это соответствует главному правилу SvelteKit: server process долгоживущий, поэтому request/user state нельзя хранить в общих module-level переменных. [Документация SvelteKit state management](https://svelte.dev/docs/kit/state-management).

Оценка SSR-архитектуры ядра без плагина: **8.7/10**.

Оценка SSR-интеграции вместе с плагином: **7.6/10**.

### Edges

Request isolation на Node реализована очень достойно:

- [`EdgesHandle.ts:7`](/Users/sergeygalaktionov/Documents/work/frontend/packages/edge-s/src/lib/server/EdgesHandle.ts#L7) использует `AsyncLocalStorage`;
- каждый запрос получает отдельный `Symbol`;
- provider instances хранятся в request data;
- store map привязана к request symbol через `WeakMap`;
- construction stack request-scoped;
- состояние автоматически освобождается после исчезновения request symbol;
- нет общей server Map с пользовательскими данными.

Это одна из лучших частей всей системы.

Ограничения находятся не в request isolation, а в сериализации, CSP и зависимости от Node.

Оценка request isolation: **9.1/10**.

Оценка полной SSR-безопасности: **8.0/10**.

## Оценки Пакетов

| Пакет                           | Код | SSR |      Тесты | Production-ready          |       Итог |
| ------------------------------- | --: | --: | ---------: | ------------------------- | ---------: |
| `@azure-net/kit`                | 8.3 | 7.9 |        8.1 | Условно да                | **7.8/10** |
| `@azure-net/edges`              | 8.2 | 8.0 |        7.8 | Условно да на Node        | **7.7/10** |
| `@azure-net/tools`              | 7.8 | 7.7 |        8.7 | Почти да                  | **7.8/10** |
| `@azure-net/edges-translations` | 7.5 | 7.7 |        7.1 | Да для одного manager     | **7.4/10** |
| `@azure-net/ui-kit`             | 8.0 | 8.3 |        7.9 | Для текущего API почти да | **7.9/10** |
| `@azure-net/cli`                | 6.8 | N/A |        2.0 | Пока нет                  | **6.1/10** |
| `azure-net-kit-docs`            | 7.0 | N/A | Build only | Нужна актуализация        | **6.8/10** |
| `azure-net-test-stand`          | 4.5 | 4.0 |      Стенд | Не применимо              | **3.8/10** |

### `@azure-net/kit`

Самый зрелый пакет экосистемы. Архитектура DI, errors, schemas, HTTP abstraction, createApp и async helpers сильная. Производительность отличная.

Production-ready при условиях:

- Node-compatible runtime;
- фиксированный проверенный диапазон SvelteKit;
- только синхронные client navigation guards;
- формы преимущественно JSON-like;
- обход пустых HTTP body.

После устранения P1 выше пакет реалистично выйдет на **9/10**.

### `@azure-net/edges`

Очень сильная серверная изоляция. Основной долг уже не архитектурный, а инфраструктурный:

- сериализация;
- CSP;
- Node runtime declaration;
- устойчивость Vite plugin;
- поддержка всех валидных форм export.

После перехода на devalue/hydratable-подобную модель и CSP integration пакет также может выйти на **9/10**.

### `@azure-net/edges-translations`

Для одного manager на приложение SSR-safe: server values находятся в request locals, browser store отделён.

Для нескольких manager prefix пока не завершает изоляцию. `Accept-Language` стоит улучшить до production-grade negotiation.

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

### Документация

Сборка проходит, двухъязычная структура хорошая. Но есть устаревшие участки:

- [`shared-and-ui.md:30`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-docs/docs/api/shared-and-ui.md#L30) описывает отсутствующий `useAsyncHelperError`;
- [`shared-and-ui.md:124`](/Users/sergeygalaktionov/Documents/work/frontend/packages/azure-net-kit-docs/docs/api/shared-and-ui.md#L124) неправильно деструктурирует `AppEvents`;
- CLI-документация не описывает `generate routes`;
- присутствуют опечатки и склеенные фразы.

### Test Stand

Production build проходит, но `svelte-check` выдаёт 9 ошибок.

Причины:

- зависимость всё ещё `@azure-net/kit ^4.0.0`;
- остались `$core` imports;
- одновременно присутствует старая и новая essentials-структура.

Стенд сейчас не подтверждает совместимость актуальной экосистемы и должен быть синхронизирован перед финальным релизным прогоном.

## Верификация

Фактически выполнено:

| Пакет                             | Результат            |
| --------------------------------- | -------------------- |
| Kit unit                          | 101/101              |
| Kit check                         | 0 errors, 0 warnings |
| Kit lint                          | Pass                 |
| Kit prepack/publint               | Pass                 |
| Edges unit                        | 46/46                |
| Edges check/lint                  | Pass                 |
| Tools unit                        | 117/117              |
| Tools typecheck/lint/build        | Pass                 |
| Translations unit                 | 26/26                |
| Translations check/lint           | Pass                 |
| UI-kit unit                       | 37/37                |
| UI-kit check/lint/prepack/publint | Pass                 |
| CLI typecheck/lint                | Pass                 |
| Docs build                        | Pass                 |
| Test stand build                  | Pass                 |
| Test stand check                  | 9 errors             |

Внешний HTTP integration test не завершился из-за сетевого ограничения sandbox. Playwright preview не стартовал из-за запрета открытия порта. Prepack Edges/i18n дошёл до успешной SvelteKit-сборки, но Corepack не смог записать пользовательский cache из sandbox. Это ограничения проверки, а не подтверждённые дефекты пакетов.

## Производительность Kit

Из существующих perf-тестов:

| Операция                 | Среднее время |
| ------------------------ | ------------: |
| Создание пустого app     | `0.000410 ms` |
| App с 10 dependencies    | `0.001243 ms` |
| Первое чтение dependency | `0.000909 ms` |
| Чтение cached dependency | `0.000142 ms` |
| Handle baseline          | `0.007076 ms` |
| Handle с 5 middleware    | `0.004414 ms` |

Разница в handle ниже точности микроизмерения и зависит от JIT/order. Практический вывод: собственный CPU overhead createApp/DI находится в микросекундной области и на фоне сети, SSR-render и базы данных пренебрежимо мал.

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

После первых семи пунктов `AzureNetKit + Edges` можно будет обоснованно оценивать примерно в **9/10** и считать production-ready без значимых оговорок.
