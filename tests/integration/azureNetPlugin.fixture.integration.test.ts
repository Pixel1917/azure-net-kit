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
		const viteBin = path.join(packageRoot, 'node_modules/vite/bin/vite.js');
		execFileSync(process.execPath, [viteBin, 'build', '--config', 'vite.config.ts'], {
			cwd: fixtureRoot,
			stdio: 'pipe',
			env: { ...process.env, NODE_ENV: 'production' }
		});

		const cacheKey = `?fixture=${Date.now()}`;
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
	}, 60_000);
});
