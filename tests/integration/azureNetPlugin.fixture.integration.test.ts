import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const packageRoot = process.cwd();
const fixtureRoot = path.join(packageRoot, 'tests/fixtures/plugin-app');
const outputRoot = path.join(fixtureRoot, '.svelte-kit/output/server');

afterAll(() => {
	fs.rmSync(path.join(fixtureRoot, '.svelte-kit'), { recursive: true, force: true });
});

describe('AzureNetPlugin SvelteKit fixture', () => {
	it('builds a real SvelteKit app and handles an SSR request', async () => {
		execFileSync('pnpm', ['prepack'], { cwd: packageRoot, stdio: 'pipe' });
		const viteBin = path.join(packageRoot, 'node_modules/vite/bin/vite.js');
		execFileSync(process.execPath, [viteBin, 'build', '--config', 'vite.config.ts'], {
			cwd: fixtureRoot,
			stdio: 'pipe',
			env: { ...process.env, NODE_ENV: 'production' }
		});

		const cacheKey = `?fixture=${Date.now()}`;
		execFileSync(process.execPath, ['--expose-gc', path.join(fixtureRoot, 'retention.mjs')], {
			cwd: fixtureRoot,
			stdio: 'pipe',
			timeout: 30_000
		});
		const [{ Server }, { manifest }] = await Promise.all([
			import(`${pathToFileURL(path.join(outputRoot, 'index.js')).href}${cacheKey}`),
			import(`${pathToFileURL(path.join(outputRoot, 'manifest.js')).href}${cacheKey}`)
		]);
		const server = new Server(manifest);
		await server.init({ env: {} });

		const response = await server.respond(new Request('http://fixture.local/'), {
			getClientAddress: () => '127.0.0.1'
		});
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('AzureNetPlugin fixture');
		expect(html).toContain('handled:true');
		expect(html).toContain('boot-ready');
		expect(html).toContain('Fixture EN');
		expect(html).not.toContain('UNUSED_DICTIONARY_SENTINEL');
		expect(html).toContain('data-azure-net-locale="en"');
		expect(html).not.toContain('data-edges-state');
		const users = await Promise.all(
			['alice', 'bob'].map(async (user) => {
				const response = await server.respond(new Request(`http://fixture.local/?user=${user}`), { getClientAddress: () => '127.0.0.1' });
				return response.text();
			})
		);
		expect(users[0]).toContain('alice');
		expect(users[0]).not.toContain('bob');
		expect(users[1]).toContain('bob');
		expect(users[1]).not.toContain('alice');
		expect(html).toContain('intercepted:transported');
		expect(response.headers.get('set-cookie')).toContain('fixture-cookie=hello%20world');
		expect(response.headers.get('set-cookie')).not.toContain('%2520');
		expect(fs.existsSync(path.join(fixtureRoot, 'src/hooks.server.ts'))).toBe(false);
		expect(fs.existsSync(path.join(fixtureRoot, 'src/hooks.client.ts'))).toBe(false);

		const rerouted = await server.respond(new Request('http://fixture.local/alias'), {
			getClientAddress: () => '127.0.0.1'
		});
		expect(rerouted.status).toBe(200);
		expect(await rerouted.text()).toContain('AzureNetPlugin fixture');

		for (const [failure, status] of [
			['app', 418],
			['unknown', 503]
		] as const) {
			const failed = await server.respond(new Request(`http://fixture.local/?failure=${failure}`), {
				getClientAddress: () => '127.0.0.1'
			});
			const body = await failed.text();
			expect(failed.status).toBe(status);
			expect(body).toContain(`fixture-${failure}`);
			expect(body).not.toContain('private-fixture-error');
		}
		const russian = await server.respond(new Request('http://fixture.local/', { headers: { 'accept-language': 'ru' } }), {
			getClientAddress: () => '127.0.0.1'
		});
		expect(await russian.text()).toContain('Fixture RU');
	}, 60_000);
});
