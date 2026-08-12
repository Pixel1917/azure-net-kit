import path from 'node:path';
import fs from 'node:fs';
import type { Plugin } from 'vite';

export interface AzureNetPluginOptions {
	silentChromeDevtools?: boolean;
}

const VIRTUAL_SERVER_UTILS_ID = 'virtual:azure-net-kit/server-utils';
const RESOLVED_VIRTUAL_SERVER_UTILS_ID = `\0${VIRTUAL_SERVER_UTILS_ID}`;
const VIRTUAL_SERVER_HOOKS_ID = 'virtual:azure-net-kit/hooks.server';
const VIRTUAL_CLIENT_HOOKS_ID = 'virtual:azure-net-kit/hooks.client';
const RESOLVED_VIRTUAL_SERVER_HOOKS_ID = `\0${VIRTUAL_SERVER_HOOKS_ID}`;
const RESOLVED_VIRTUAL_CLIENT_HOOKS_ID = `\0${VIRTUAL_CLIENT_HOOKS_ID}`;
const VIRTUAL_PROGRAM_ID = 'virtual:azure-net-kit/program';
const RESOLVED_VIRTUAL_PROGRAM_ID = `\0${VIRTUAL_PROGRAM_ID}`;
const GENERATED_MARKER = '__AZURE_NET_KIT_VIRTUAL_HOOK__';

const findStaticImportInsertPosition = (sourceCode: string): number => {
	const importRegex = /(?:^|\n)(import\s+(?:type\s+)?(?:\{[^}]*\}|\*|\w+)(?:\s+from)?\s+['"][^'"]+['"];?)/gm;
	let lastMatch: RegExpExecArray | null = null;
	let match: RegExpExecArray | null;

	while ((match = importRegex.exec(sourceCode)) !== null) {
		lastMatch = match;
	}

	return lastMatch ? lastMatch.index + lastMatch[0].length : 0;
};

const createVirtualServerHooks = (silentChromeDevtools: boolean) => `// ${GENERATED_MARKER}
import { edgesHandle, edgesHandleRaw } from '${VIRTUAL_SERVER_UTILS_ID}';

const getRegister = async () => (await import('${VIRTUAL_PROGRAM_ID}')).register;

export const init = async () => (await getRegister()).serverInit();

export const handle = edgesHandle(async ({ serialize, edgesEvent, resolve }) => {
	const register = await getRegister();

	return register.handle({
		event: edgesEvent,
		resolve: (event, options) =>
			resolve(event, {
				...options,
				transformPageChunk: async (chunk) => {
					const html = options?.transformPageChunk ? await options.transformPageChunk(chunk) : chunk.html;
					return serialize(html);
				}
			})
	});
}
${silentChromeDevtools ? ')' : ', false)'};

export const handleError = async ({ error, event, status, message }) => {
	let result;

	await edgesHandleRaw(event, async () => {
		const register = await getRegister();
		result = await register.serverError({ error, event, status, message });

		return new Response(null, { status: 204 });
	});

	return result;
};
`;

const createVirtualServerUtils = () => "export { edgesHandle, edgesHandleRaw } from '@azure-net/kit/edges/internal-package/utils';";

const createVirtualClientHooks = () => `// ${GENERATED_MARKER}
const getRegister = async () => (await import('${VIRTUAL_PROGRAM_ID}')).register;

export const init = async () => (await getRegister()).clientInit();
export const handleError = async (input) => (await getRegister()).clientError(input);
`;

const createVirtualProgram = (root: string) => {
	const tsProgram = path.join(root, 'src', 'program.ts');
	const jsProgram = path.join(root, 'src', 'program.js');

	if (fs.existsSync(tsProgram)) return `export { register } from '/src/program.ts';`;
	if (fs.existsSync(jsProgram)) return `export { register } from '/src/program.js';`;

	throw new Error('[AzureNetPlugin] src/program.ts is required. Create it and export register from createApp().');
};

const assertProgramExists = (root: string) => {
	const tsProgram = path.join(root, 'src', 'program.ts');
	const jsProgram = path.join(root, 'src', 'program.js');

	if (fs.existsSync(tsProgram) || fs.existsSync(jsProgram)) return;

	throw new Error('[AzureNetPlugin] src/program.ts is required. Create it and export register from createApp().');
};

const hasUserHook = (root: string, hookName: 'hooks.server' | 'hooks.client') => {
	const srcPath = path.join(root, 'src');
	const candidates = ['.ts', '.js'].map((extension) => path.join(srcPath, `${hookName}${extension}`));

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}

	return null;
};

const assertNoUserHooks = (root: string) => {
	const serverHook = hasUserHook(root, 'hooks.server');
	const clientHook = hasUserHook(root, 'hooks.client');
	const hook = serverHook ?? clientHook;

	if (!hook) return;

	throw new Error(
		`[AzureNetPlugin] ${path.relative(root, hook)} is not allowed when AzureNetPlugin is enabled. ` +
			'Move your lifecycle code to src/program.ts via createApp().'
	);
};

const ensureVirtualImport = (sourceCode: string, importLine: string) => {
	if (sourceCode.includes(importLine)) return sourceCode;

	const insertPos = findStaticImportInsertPosition(sourceCode);
	return `${sourceCode.slice(0, insertPos)}\n${importLine}\n${sourceCode.slice(insertPos)}`;
};

const transformGeneratedServerInternal = (sourceCode: string) => {
	if (sourceCode.includes(GENERATED_MARKER)) return null;
	if (/hooks\.server\.(?:ts|js)/.test(sourceCode)) {
		throw new Error(
			'[AzureNetPlugin] SvelteKit detected a user-managed hooks.server file. Move its lifecycle code to src/program.ts via createApp().'
		);
	}

	const getHooksPattern = /export\s+async\s+function\s+get_hooks\s*\(\)\s*\{[\s\S]*?\n\}/m;
	if (!getHooksPattern.test(sourceCode)) {
		throw new Error('[AzureNetPlugin] Unsupported SvelteKit generated server internals: get_hooks() was not found.');
	}

	const universalImportMatch = sourceCode.match(/\(\{\s*reroute,\s*transport\s*\}\s*=\s*await\s*import\([^)]+\)\);/);
	const universalImport = universalImportMatch?.[0] ? `\n\t${universalImportMatch[0]}` : '';
	const importLine = `import * as __azureNetServerHooks from '${VIRTUAL_SERVER_HOOKS_ID}';`;
	const getHooksReplacement = `export async function get_hooks() {
\tlet reroute;
\tlet transport;${universalImport}

\treturn {
\t\thandle: __azureNetServerHooks.handle,
\t\thandleFetch: undefined,
\t\thandleError: __azureNetServerHooks.handleError,
\t\thandleValidationError: undefined,
\t\tinit: __azureNetServerHooks.init,
\t\treroute,
\t\ttransport
\t};
}`;
	const transformed = ensureVirtualImport(sourceCode, `// ${GENERATED_MARKER}\n${importLine}`).replace(getHooksPattern, getHooksReplacement);

	return transformed;
};

const transformGeneratedClientApp = (sourceCode: string) => {
	if (sourceCode.includes(GENERATED_MARKER)) return null;
	if (/hooks\.client\.(?:ts|js)/.test(sourceCode)) {
		throw new Error(
			'[AzureNetPlugin] SvelteKit detected a user-managed hooks.client file. Move its lifecycle code to src/program.ts via createApp().'
		);
	}

	const handleErrorPattern = /handleError:\s*\(\(\{\s*error\s*\}\)\s*=>\s*\{\s*console\.error\(error\)\s*\}\)/m;
	if (!handleErrorPattern.test(sourceCode)) {
		throw new Error('[AzureNetPlugin] Unsupported SvelteKit generated client app: default handleError was not found.');
	}

	let transformed = ensureVirtualImport(sourceCode, `// ${GENERATED_MARKER}\nimport * as __azureNetClientHooks from '${VIRTUAL_CLIENT_HOOKS_ID}';`);
	transformed = transformed.replace(handleErrorPattern, 'handleError: __azureNetClientHooks.handleError');

	if (/^\s*init:\s*[^,\n]+,?/m.test(transformed)) {
		transformed = transformed.replace(/^\s*init:\s*[^,\n]+,?/m, '\tinit: __azureNetClientHooks.init,');
	} else {
		transformed = transformed.replace(
			/handleError:\s*__azureNetClientHooks\.handleError,?/m,
			'handleError: __azureNetClientHooks.handleError,\n\tinit: __azureNetClientHooks.init,'
		);
	}

	return transformed;
};

export const AzureNetPlugin = (options?: AzureNetPluginOptions): Plugin => {
	const { silentChromeDevtools = true } = options ?? {};

	let root = process.cwd();

	return {
		name: 'azure-net-kit-plugin',
		enforce: 'pre',

		config(config) {
			root = path.resolve(config.root ?? process.cwd());
			assertNoUserHooks(root);
			assertProgramExists(root);
		},

		configResolved(config) {
			root = config.root;
			assertNoUserHooks(root);
			assertProgramExists(root);
		},

		buildStart() {
			assertNoUserHooks(root);
			assertProgramExists(root);
		},

		resolveId(id) {
			if (id === VIRTUAL_SERVER_UTILS_ID) return RESOLVED_VIRTUAL_SERVER_UTILS_ID;
			if (id === VIRTUAL_SERVER_HOOKS_ID) return RESOLVED_VIRTUAL_SERVER_HOOKS_ID;
			if (id === VIRTUAL_CLIENT_HOOKS_ID) return RESOLVED_VIRTUAL_CLIENT_HOOKS_ID;
			if (id === VIRTUAL_PROGRAM_ID) return RESOLVED_VIRTUAL_PROGRAM_ID;
			return null;
		},

		load(id) {
			if (id === RESOLVED_VIRTUAL_SERVER_UTILS_ID) return createVirtualServerUtils();
			if (id === RESOLVED_VIRTUAL_SERVER_HOOKS_ID) return createVirtualServerHooks(silentChromeDevtools);
			if (id === RESOLVED_VIRTUAL_CLIENT_HOOKS_ID) return createVirtualClientHooks();
			if (id === RESOLVED_VIRTUAL_PROGRAM_ID) return createVirtualProgram(root);
			return null;
		},

		transform(code, id) {
			const normalizedId = id.split('?')[0].split(path.sep).join('/');

			if (normalizedId.endsWith('/.svelte-kit/generated/server/internal.js')) {
				const transformed = transformGeneratedServerInternal(code);
				return transformed ? { code: transformed, map: null } : null;
			}

			if (normalizedId.endsWith('/.svelte-kit/generated/client/app.js') || normalizedId.endsWith('/.svelte-kit/generated/client-optimized/app.js')) {
				const transformed = transformGeneratedClientApp(code);
				return transformed ? { code: transformed, map: null } : null;
			}

			return null;
		}
	};
};
