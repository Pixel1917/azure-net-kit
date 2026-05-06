import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AzureNetPlugin } from '../src/lib/plugin/index.js';

const tempRoots: string[] = [];

const createTempRoot = () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-net-plugin-'));
	tempRoots.push(root);
	fs.mkdirSync(path.join(root, 'src'), { recursive: true });
	return root;
};

const runConfig = (root: string, plugin = AzureNetPlugin()) => {
	if (typeof plugin.config !== 'function') throw new Error('plugin config hook is missing');

	plugin.config.call({} as never, { root }, { command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false });
};

const runTransform = async (code: string, id: string, plugin = AzureNetPlugin()) => {
	if (typeof plugin.transform !== 'function') throw new Error('plugin transform hook is missing');

	const result = await plugin.transform.call({} as never, code, id);
	if (!result || typeof result === 'string') return result;
	return result.code;
};

const runResolveId = async (id: string, plugin = AzureNetPlugin()) => {
	if (typeof plugin.resolveId !== 'function') throw new Error('plugin resolveId hook is missing');

	return await plugin.resolveId.call({} as never, id, undefined, { attributes: {}, custom: {}, isEntry: false });
};

const runLoad = async (id: string, plugin = AzureNetPlugin()) => {
	if (typeof plugin.load !== 'function') throw new Error('plugin load hook is missing');

	return await plugin.load.call({} as never, id);
};

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('AzureNetPlugin', () => {
	it('does not create physical hooks or program files', () => {
		const root = createTempRoot();

		runConfig(root);

		expect(fs.existsSync(path.join(root, 'src/hooks.server.ts'))).toBe(false);
		expect(fs.existsSync(path.join(root, 'src/hooks.client.ts'))).toBe(false);
		expect(fs.existsSync(path.join(root, 'src/program.ts'))).toBe(false);
	});

	it('uses an existing program through the virtual program module', async () => {
		const root = createTempRoot();
		const programPath = path.join(root, 'src/program.ts');
		fs.writeFileSync(programPath, 'export const existing = true;\n');

		const plugin = AzureNetPlugin();
		runConfig(root, plugin);
		const resolved = await runResolveId('virtual:azure-net-kit/program', plugin);
		const loaded = await runLoad(String(resolved), plugin);

		expect(loaded).toBe("export { register } from '/src/program.ts';");
	});

	it('throws when a user-managed server hook exists', () => {
		const root = createTempRoot();
		fs.writeFileSync(path.join(root, 'src/hooks.server.ts'), "export const handle = () => new Response('bad');\n");

		expect(() => runConfig(root)).toThrow('Move your lifecycle code to src/program.ts via createApp().');
	});

	it('throws when a user-managed client hook exists', () => {
		const root = createTempRoot();
		fs.writeFileSync(path.join(root, 'src/hooks.client.ts'), 'export const init = () => undefined;\n');

		expect(() => runConfig(root)).toThrow('Move your lifecycle code to src/program.ts via createApp().');
	});

	it('provides virtual server and client hooks', async () => {
		const root = createTempRoot();
		const plugin = AzureNetPlugin({ silentChromeDevtools: false });

		runConfig(root, plugin);

		const serverId = await runResolveId('virtual:azure-net-kit/hooks.server', plugin);
		const clientId = await runResolveId('virtual:azure-net-kit/hooks.client', plugin);
		const serverHooks = await runLoad(String(serverId), plugin);
		const clientHooks = await runLoad(String(clientId), plugin);

		expect(serverHooks).toContain('__AZURE_NET_KIT_VIRTUAL_HOOK__');
		expect(serverHooks).toContain("import { edgesHandle, edgesHandleRaw } from 'virtual:azure-net-kit/server-utils';");
		expect(serverHooks).toContain("await import('virtual:azure-net-kit/program')");
		expect(serverHooks).not.toContain("import { register } from 'virtual:azure-net-kit/program';");
		expect(serverHooks).toContain('export const init = () => undefined;');
		expect(serverHooks).toContain('await register.serverInit?.();');
		expect(serverHooks).toContain('export const handleError = async');
		expect(serverHooks).toContain('await edgesHandleRaw(event');
		expect(serverHooks).toContain(', false);');
		expect(clientHooks).toContain("await import('virtual:azure-net-kit/program')");
		expect(clientHooks).toContain('export const init = async');
		expect(clientHooks).toContain('export const handleError = async');
	});

	it('injects virtual server hooks into SvelteKit generated server internals', async () => {
		const code = `
import root from '../root.js';

export const options = { hooks: null };

export async function get_hooks() {
\tlet handle;
\tlet handleFetch;
\tlet handleError;
\tlet handleValidationError;
\tlet init;

\tlet reroute;
\tlet transport;
\t({ reroute, transport } = await import("./hooks.js"));

\treturn {
\t\thandle,
\t\thandleFetch,
\t\thandleError,
\t\thandleValidationError,
\t\tinit,
\t\treroute,
\t\ttransport
\t};
}
`;

		const transformed = await runTransform(code, '/app/.svelte-kit/generated/server/internal.js');

		expect(transformed).toContain("import * as __azureNetServerHooks from 'virtual:azure-net-kit/hooks.server';");
		expect(transformed).toContain('handle: __azureNetServerHooks.handle');
		expect(transformed).toContain('handleError: __azureNetServerHooks.handleError');
		expect(transformed).toContain('init: __azureNetServerHooks.init');
		expect(transformed).toContain('({ reroute, transport } = await import("./hooks.js"));');
	});

	it('injects virtual client hooks into SvelteKit generated client app', async () => {
		const code = `
import * as client_hooks from '../../../src/hooks.client.ts';

export const hooks = {
\thandleError: client_hooks.handleError || (({ error }) => { console.error(error) }),
\tinit: client_hooks.init,
\treroute: (() => {}),
\ttransport: {}
};
`;

		const transformed = await runTransform(code, '/app/.svelte-kit/generated/client/app.js');

		expect(transformed).toContain("import * as __azureNetClientHooks from 'virtual:azure-net-kit/hooks.client';");
		expect(transformed).not.toContain('client_hooks');
		expect(transformed).toContain('handleError: __azureNetClientHooks.handleError');
		expect(transformed).toContain('init: __azureNetClientHooks.init');
	});

	it('wraps server load and actions through kit server exports', async () => {
		const code = `
export const load = async () => ({ ok: true });
export const actions = { default: async () => ({ ok: true }) };
`;

		const transformed = await runTransform(code, '/tmp/routes/+page.server.ts');

		expect(transformed).toContain("from 'virtual:azure-net-kit/server-utils';");
		expect(transformed).toContain('__withEdgesServerLoad');
		expect(transformed).toContain('__withEdgesActions');
		expect(transformed).toContain('export { __edgesServerLoad as load };');
		expect(transformed).toContain('export { __edgesServerActions as actions };');
	});

	it('wraps universal load through kit exports', async () => {
		const transformed = await runTransform('export const load = () => ({ ok: true });', '/tmp/routes/+page.ts');

		expect(transformed).toContain("from 'virtual:azure-net-kit/universal-utils';");
		expect(transformed).toContain('__withEdgesUniversalLoad');
		expect(transformed).toContain('export { __edgesUniversalLoad as load };');
	});

	it('does not wrap modules twice', async () => {
		const code = `
void '__EDGES_SYNC_WRAPPED__';
import { __withEdgesUniversalLoad } from 'virtual:azure-net-kit/universal-utils';
const load = () => ({ ok: true });
export const load = __withEdgesUniversalLoad(load);
`;

		await expect(runTransform(code, '/tmp/routes/+page.ts')).resolves.toBeNull();
	});
});
