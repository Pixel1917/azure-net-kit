# Welcome to **@azure-net/kit**

#### [docs](https://svelte.kit.azure-net.ru)

## Version 6 integration

Configure `AzureNetPlugin()` from `@azure-net/kit/plugin` alongside SvelteKit in Vite,
then export `{ register }` from `createApp(...)` in `src/program.ts`.
Call `register()` synchronously during root layout initialization. `useClient` may
be asynchronous: the navigation subscription is installed synchronously, and
middleware supplied after an `await` applies only from that point onward. Handle
the returned Promise if client initialization can fail. Client middleware itself
must remain synchronous.

The plugin provides virtual hooks only. It does not create or rewrite page/layout
modules. Manual `hooks.server`, `hooks.client` and `hooks` files are forbidden.
Initial request state is hydrated once through Svelte hydratable; later navigation is client-owned.

`program.ts` is universal: a static server-only import does not become safe merely
because it is used inside `useServer`. Use an explicit build-time browser guard
with dynamic server imports when needed, and retain SvelteKit's build checks.

### Application structure

```text
src/app/
  Contexts/{Orders,Identity,SharedKernel}/
    Domain/{Entities,Ports,Enums}
    Infrastructure/Repositories
    Application/UseCases
  Presentation/{Admin,Public,Shared}/
    Ui/
    Scopes/
    Shell/
  Platform/
    Foundation/{Datasource,Response,Schema,DI}
    Bootstrap/{Routes,Localization}
```

Without workspaces, `Ui`, `Scopes` and `Shell` sit directly under `Presentation`.
Central DI lives in `Platform/Foundation/DI/ApplicationProvider.ts`. Contexts may
import `SharedKernel`, but not each other. Presentation scopes may compose any
contexts. Workspaces may import `Shared`, but not each other.

Boundary providers cache their proxy, registration and services per SSR request,
not globally. Browser instances are cached until cleanup. Factories and `boot`
are synchronous. `await cleanupProvider(name)` explicitly disposes instantiated
services and resets the cache; request completion does not invoke it automatically.

Install the CLI separately with `npm i -D @azure-net/cli`. Its commit-tools command
configures Prettier without installing commit packages. `azure-net commit` commits
staged changes; `azure-net push` checks, stages, commits and pushes. `--no-check`
skips checks. Review `.gitignore` before staging.

## Class Presenters And Async Helpers

Import `createAsyncResource` and `createAsyncAction` directly from
`@azure-net/kit/delivery`. `createAsyncHelpers()` has been removed. The error hook
configured by `createApp().useAzureNetKitError` is still resolved per execution;
there is no per-presenter parser or shared server error state. A custom error
payload can be typed as the third generic: `createAsyncAction<Response, Request, CustomError>()`.

```ts
import { RegisterProvider, createAsyncResource } from '@azure-net/kit/delivery';
import { ApplicationProvider } from '#platform/Foundation/DI';
import type { OrdersUseCases } from '#contexts/Orders/Application/UseCases/OrdersUseCases';

export class OrdersPresenter {
	constructor(private readonly useCases: OrdersUseCases) {}

	collection() {
		return createAsyncResource(() => this.useCases.collection());
	}
}

export const useOrdersPresenter = RegisterProvider(
	() => {
		const { Orders } = ApplicationProvider();
		return new OrdersPresenter(Orders);
	},
	{ lifecycle: 'scoped', bindMethods: true }
);
```

Call `useOrdersPresenter()` during component initialization, not at module scope.
The registration itself is safe at module scope and does not resolve dependencies.
`RegisterProvider` returns the actual class instance, without a proxy. The optional
second argument is an options object: `{ lifecycle?: ..., bindMethods?: ... }`.
Defaults are `lifecycle: 'scoped'` and `bindMethods: false`. The old string argument
is no longer supported. With binding disabled, methods and property descriptors are
left untouched.

Use `bindMethods: true` to bind function-valued data properties, including inherited
methods, or `bindMethods: ['collection']` to select typed method names. Binding runs
only after the factory returns, once for each newly created instance. Accessors are
never evaluated or replaced, including Svelte rune accessors. Constructors and
Object.prototype methods are excluded. A selected accessor (even one returning a
function), missing method, or protected property throws instead of silently failing.
TypeScript cannot distinguish a function-returning getter from a method, so the
accessor check also happens at runtime.

Method references are stable after binding. Frozen/non-extensible instances cannot
receive inherited bound methods. Arbitrary proxies and exotic built-in objects are
not supported binding targets. Function-valued fields are also bound with `true`;
use an explicit list if the instance holds component constructors or other callable
dependencies. No global cache retains instances or bound functions. Binding does not
apply retroactively to callbacks captured during construction or methods replaced later.
Classes using Svelte runes such as `$state` must be placed in a `.svelte.ts` module
(or declared inside a Svelte component), not a regular `.ts` file.

| Lifecycle          | Server                                    | Browser                       |
| ------------------ | ----------------------------------------- | ----------------------------- |
| `scoped` (default) | One instance per registration per request | New instance per call         |
| `transient`        | New instance per call                     | New instance per call         |
| `singleton`        | One instance per registration per request | One instance per registration |

Server caching requires `AzureNetPlugin` request context and fails
outside it. There is no process-wide server singleton. Request caches have weak
keys and do not retain completed requests. Registrations do not require names,
Svelte context, hydration, or state serialization. Factory callbacks must be
synchronous; recursive construction is rejected.

This API does not own effects, subscriptions, timers, or `dispose()`. Keep
component-owned effects in component-lived instances; a cached browser singleton
must not rely on effects owned by the first component that requested it. SSR
isolation does not serialize state to the browser and cannot protect mutable
module-level state captured by user factories.

**@azure-net/kit** is a universal toolkit and library collection, developed as part of the **Azure-net** ecosystem. It is designed to speed up modern application development, reduce boilerplate code, and maintain a unified project architecture.

## ✨ What is it?

**@azure-net/kit** is much more than just a collection of utilities or components. It is a complete **architecture** (Azure-net Architecture) based on **DDD (Domain-Driven Design)** principles, helping you build scalable and maintainable projects with a clear structure.

## 🚀 What's included?

- **Reactive state classes** — request-isolated server instances and browser singletons via `RegisterProvider`.
- **Localization and translation**: built-in rune-based i18n with request-scoped SSR instances. No edges or external translations dependency.
- **Extensive utilities** — for working with text, objects, dates, and common tasks.
- **Data validation** — handy rules and validators.
- **Reusable base abstractions** — `Repositories`, `Services`, `Providers`, and `Datasources` for quick setup and reuse.
- **Unified architecture approach** — the package provides a solid project structure and helps enforce consistent development standards.

## 🎯 Why use it?

By using **@azure-net/kit**, you get a ready-to-use project framework that:

- reduces boilerplate code,
- accelerates development,
- simplifies testing,
- supports a clear and predictable architecture.

This is especially useful for teamwork on medium to large-scale applications.

## 📚 Learn more

In this guide, you will find:

- Step-by-step instructions for setup and configuration.
- Detailed explanations of architectural patterns.
- Examples of using the built-in store and translation.
- Recommendations for organizing code with `Repositories`, `Services`, and `Datasources`.

## 🚀 Get started

Ready to dive in? Check out the [docs](https://svelte.kit.azure-net.ru) and start building your app faster and more reliably with **Azure-net**.

## Initial state and `useBoot`

`AzureNetPlugin()` owns a kit-local AsyncLocalStorage scope. It does not depend on
edges, serialize stores, inject response scripts or create virtual route modules.
There are no edges store/presenter exports or devtools exports in this version.
`RequestContext.current()` exposes only `event` and `state`, is server-only, and
throws outside an active request. Internal DI/error/lifecycle caches are private.

Declare transferable state in `src/app.d.ts` (prefer optional fields for CSR):

```ts
import type { IUser } from '#contexts/Identity/Domain';
declare global {
	namespace App {
		interface RequestContextState {
			currentUser?: IUser | null;
		}
	}
}
export {};
```

```ts
import { createApp } from '@azure-net/kit';
import { RequestContext } from '@azure-net/kit/server-context';

export const { register } = createApp((app) =>
	app
		.useServer(async ({ event, resolve, useMiddlewares }) => {
			await useMiddlewares([ServerAuth]);
			return resolve(event);
		})
		.useBoot(({ state }) => {
			useCurrentUser().setUser(state.currentUser ?? null);
		})
);
```

In the root layout call `register()` before resolving presenters or state classes.
`useBoot` is synchronous and runs once per server request render and once per
browser app initialization, before client lifecycle callbacks. Await all server
state preparation before `resolve`. Do not mutate the transfer snapshot during
rendering. Client navigations and repeated register calls do not rehydrate state.
`useClientInit` runs earlier and must not depend on this snapshot. CSR without an
SSR snapshot receives `{}`; initialize defaults and fetch missing data explicitly.
Only publish safe DTOs, never tokens or the whole request/locals. Personalized HTML
must not be publicly cached. Classes, functions and services are not serialized.

Svelte currently requires async mode for `hydratable`:

```ts
sveltekit({ compilerOptions: { experimental: { async: true } } });
```

Keep the application's CSP correctly configured; Svelte manages the transfer
script and serialization. No custom HTML parser is used by the kit.

## DI naming

`createBoundaryProvider` is replaced by `CreateServiceContainer` (no compatibility alias):

```ts
const ApplicationProvider = CreateServiceContainer('ApplicationProvider', {
	register: () => ({ Users: () => new UsersUseCases(repository) })
});
const { Users } = ApplicationProvider();
```

The accessor remains lazy, synchronous and request-scoped on SSR. `RegisterProvider`
registers an individual class factory; `singleton` means one browser instance but
one instance per request on the server, never a server process singleton.

Built-in i18n: see [I18N.md](./I18N.md). Register a `new TranslationManager(options)` through `app.useTranslations(manager)`. Server preparation, locale hydration and client dictionary loading run automatically before the corresponding user hooks. No separate translation package or manual lifecycle calls are required.

## AsyncSignal SSR Hydration

Client-only signals remain synchronous. Opt into SSR with a stable, non-empty key:

```svelte
<script lang="ts">
	import { createAsyncSignal } from '@azure-net/kit';

	const result = await createAsyncSignal(() => loadProfile(), {
		server: true,
		key: 'profile:current-user'
	});
</script>

<p>{result.response?.name}</p>
<button onclick={() => result.refresh()}>Refresh</button>
```

Call this during component initialization with Svelte experimental async enabled.
Svelte's `hydratable` transfers the initial serializable result to the browser,
which reuses it without a duplicate request; later refreshes execute normally.
There is no module-global server request state. The handler must work in both
environments. Keys must match across SSR/hydration and distinguish request inputs.

`beforeSend` runs only for actual requests; success/error callbacks and `ready`
settlement apply on both sides. Request errors produce an error-state signal.
`immediate: false` keeps the signal idle and disables initial hydration. Batch
factories stay synchronous and explicitly reject `server: true` at type-check and
runtime; use individually awaited server signals instead.

See [AsyncSignal details](./src/lib/svelte/async-signal/README.md) for lifecycle,
serialization, errors, cancellation, CSP, and batch behavior.

## SvelteKit 3 hooks and class middleware

Error callbacks use the native discriminated `CaughtError` contract from
`@sveltejs/kit/hooks`. `status` and `message` are no longer added at the top level.
For `kind: 'app'`, `'framework'` or `'validation'`, read `error.status` and
`error.message`. For `kind: 'unknown'`, `error` remains `unknown`: narrow it before
logging and do not return its potentially private message to clients. Validation
issues are available only in the `'validation'` branch. Return `{ status, message }`
to override the public response, or return nothing to retain SvelteKit defaults.
The removed `handleValidationError` hook is not generated.

```ts
app.useServerError(({ kind, error, useLogger }) => {
	if (kind === 'unknown') {
		useLogger(error, {});
		return { status: 500, message: 'Internal Error' };
	}
	return error;
});
```

Middleware arrays now contain **constructors**, not functions or existing instances.
Constructors must accept no required arguments. A fresh instance is constructed
only when its turn is reached, on every request/navigation. Resolve dependencies
inside that instance, not into module-level request-specific variables.

```ts
import type { IServerMiddleware, ServerMiddlewareContext, IClientMiddleware, ClientMiddlewareContext } from '@azure-net/kit';

class ServerAuth implements IServerMiddleware {
	async execute({ event, next }: ServerMiddlewareContext) {
		if (!event.cookies.get('session')) return next('/login', 303);
		next();
	}
}

class ClientGuard implements IClientMiddleware {
	execute({ next, to, navigation }: ClientMiddlewareContext): undefined {
		if (navigation?.shallow) return next();
		if (to.pathname === '/private') return next('/login', { replace: true });
		return next();
	}
}

app
	.useServer(async ({ useMiddlewares, event, resolve }) => {
		await useMiddlewares([ServerAuth]);
		return resolve(event);
	})
	.useClient(({ useMiddlewares }) => {
		useMiddlewares([ClientGuard]);
	});
```

`IMiddleware<Context, Result>` is the common interface. Client `execute` is strictly
synchronous (`undefined` return, normally `return next()`); server `execute` can
return `void` or `Promise<void>`. Omitting `next()` blocks the chain. Neither the
chain nor the container automatically disposes subscriptions owned by middleware:
keep middleware short-lived and do not attach long-lived listeners there.

Client `next(location, options)` and `useRedirect(...).clientRedirectSettings`
use SvelteKit's `GotoOptions` directly: `replace`, `reset`, `refreshAll`, `shallow`,
`persistState`, `state` and `invalidate`. Client navigation data includes the native
`navigation` event. In Kit 3 shallow changes also trigger navigation hooks; choose
explicitly whether a guard should skip them. `goto` is for app routes, not external
URLs; external navigation should use browser location APIs.

## CompositionRoot

`CreateServiceContainer` remains unchanged. `CompositionRoot` is a lazy class
facade over it, with a unique symbol as its internal container identity. It can be created at module
scope; `resolve()` resolves against the current SSR request or browser
cache, never a request captured by the constructor.

```ts
import { CompositionRoot } from '@azure-net/kit';

export const Http = new CompositionRoot({
	register: () => ({ Api: () => new ApiDatasource() })
});

export const Identity = new CompositionRoot({
	dependsOn: { Http },
	register: ({ Http }) => ({
		Account: () => new AccountUseCases(new AccountRepository(Http.Api))
	})
});

// Inside a presenter factory or an active request:
const { Account } = Identity.resolve();
```

Dependencies accept both other `CompositionRoot` instances and existing
`CreateServiceContainer` accessors. Service types are inferred through the chain.
Only registration metadata is wrapped; there is no extra proxy around services
and no new caching layer. Repeated resolution preserves existing container/service
identity. If explicit cleanup is needed, use `await cleanupProvider(Identity.name)`.
Declare roots once, rather than creating new roots per component render.
`name` is now a symbol, not a serializable string. Its description is for diagnostics
only; equal descriptions never share a cache. Existing string keys passed directly
to `CreateServiceContainer` and `cleanupProvider` remain supported.
