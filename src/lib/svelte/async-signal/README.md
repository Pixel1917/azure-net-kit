# AsyncSignal server hydration

`createAsyncSignal(handler)` and `{ server: false }` return a signal synchronously,
with the existing client-only automatic execution behavior. With `{ server: true }`,
the return type is `Promise<AsyncSignalSvelte<T>>`; await it to obtain the settled
initial signal on both the server and the browser.

```svelte
<script lang="ts">
	import { createAsyncSignal } from '@azure-net/kit';

	let { api } = $props<{
		api: { getProfile(signal?: AbortSignal): Promise<{ name: string }> };
	}>();

	const profile = await createAsyncSignal((signal) => api.getProfile(signal), {
		server: true,
		key: 'profile:current-user'
	});
</script>

<p>{profile.response?.name}</p>
<button onclick={() => profile.refresh()}>Refresh</button>
```

Enable Svelte's `compilerOptions.experimental.async`. Call the factory during
component initialization, directly in the component script as above, or through a
synchronous helper called there. Do not first await inside an ordinary async helper,
or create a server-hydratable signal in a module singleton, event handler, `onMount`,
or `$effect`: Svelte needs the active component render context when `hydratable` is
called. The request handler itself may await normally. Supply a handler that can run
in both environments. In this example the parent supplies an API service created
for the current SSR request, and independently creates its browser counterpart.
Do not serialize the service through `load` data. Its server implementation must
capture the current request's fetch/auth context, or use an absolute trusted API
URL with explicitly scoped credentials. Global server `fetch('/api/profile')`
cannot resolve a relative URL, and `credentials: 'include'` does not automatically
forward the incoming user's cookies on the server. Forward only the credentials
needed by a trusted destination; never put them in the hydration payload.

The key must be non-empty, stable between SSR and hydration, and unique for each
logically distinct request in a render (include parameters when relevant). The
library namespaces it. Svelte owns the per-render payload; AsyncSignal does not add
a shared server request cache. This does not make module-global services, mutable
handler state, or publicly cached personalized HTML safe: the application must
keep those request-scoped or otherwise isolate users.
Data and non-Error rejection values must be serializable by
Svelte's `hydratable`/devalue. Native errors transfer their name and message, not
stack traces, subclasses, or custom properties. Do not return secrets or sensitive
error messages: hydratable payloads are sent to the browser.

Only the initial automatic request is hydratable. Hydration reuses its result
without invoking the handler or `beforeSend`; `onSuccess`/`onError` run for the
settled result in each environment, and `ready` waits for those callbacks. An
initial request failure yields a signal with `status: 'error'`, as before, rather
than rejecting the factory promise. Subsequent `execute`, `refresh`, and global
refreshes use normal request, cancellation, callback, and ready-cycle behavior.
`beforeSend` sees `initial: false` on a refresh after hydration.

If `onSuccess` throws, the signal enters the error state and invokes `onError`,
retaining the loaded response. If `onError` also throws, `ready` still settles;
explicit `execute`/`refresh` reject with that callback error, while automatic
initial loading consumes it to avoid an unhandled rejection. The signal's `error`
retains the original request or success-callback failure. Hydratable signals join
the browser global-refresh registry only when their component effect runs, so an
initialization abandoned before mounting leaves no registry entry. Unmounting is
not equivalent to calling `abort`: already-running handlers/callbacks may finish.

`initialData` (or its synchronous factory) initializes `response` independently in
each environment. It does not skip the automatic request or change an idle signal
to success. With `server: true` and the default `immediate: true`, the factory still
awaits initial loading; success replaces the fallback, while failure retains it.
Only the request outcome is transferred, not `initialData`, so use matching fallback
values on the server and browser to avoid hydration mismatches after a failure.

`immediate: false` disables initial loading and hydration, including in server mode:
`await createAsyncSignal(handler, { server: true, key: 'profile', immediate: false,
initialData })` returns an idle signal whose `response` and resolved `ready` contain
the initial value (or `undefined` if omitted). The key is still required. Later
explicit execution is ordinary, non-hydratable work.

Batch factories remain synchronous and deferred;
`createAsyncSignalBatch` explicitly rejects `server: true` in its factory at both
type-check and runtime. Use individually awaited server signals instead. Ordinary
batches preserve locks, parallel/sequential execution, cancellation, and ready gates.

Outside SvelteKit, include both `head` and `body` returned by `await render(...)` in
the document: Svelte places the hydration payload in `head`. Configure a CSP nonce
or hash through Svelte's render options if your application uses CSP.
