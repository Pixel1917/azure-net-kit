import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
const output = new URL('./.svelte-kit/output/server/', import.meta.url);
const { Server } = await import(new URL('index.js', output).href);
const { manifest } = await import(new URL('manifest.js', output).href);

const server = new Server(manifest);
await server.init({ env: {} });
/** @type {WeakRef<object>[]} */
const refs = [];

/** @param {number} index */
async function request(index) {
	const user = `retention-user-${index}-end`;
	const request = new Request(`http://fixture.local/?user=${user}`);
	const platform = { sentinel: { user } };
	refs.push(new WeakRef(request), new WeakRef(platform), new WeakRef(platform.sentinel));
	const response = await server.respond(request, { getClientAddress: () => '127.0.0.1', platform });
	assert.equal(response.status, 200);
	assert.ok((await response.text()).includes(user));
}

async function requests() {
	for (let batch = 0; batch < 25; batch++) {
		await Promise.all(Array.from({ length: 20 }, (_, index) => request(batch * 20 + index)));
	}
}

await requests();
const gc = globalThis.gc;
if (!gc) throw new Error('Run with --expose-gc');
let retained;
for (let attempt = 0; attempt < 30; attempt++) {
	await setImmediate();
	gc();
	await setImmediate();
	retained = refs.filter((ref) => ref.deref()).length;
	if (!retained) break;
}
assert.equal(retained, 0, 'Completed SSR requests must not be held by cached module import promises');
console.log(`Collected ${refs.length}/${refs.length} objects after 500 real SSR requests`);
