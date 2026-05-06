import path from 'node:path';
import fs from 'node:fs';
import type { Plugin } from 'vite';
import ts from 'typescript';

export interface AzureNetPluginOptions {
	silentChromeDevtools?: boolean;
	syncFromServer?: boolean;
	syncTransformMode?: 'ast' | 'regex' | 'hybrid';
}

type Edit = { start: number; end: number; text: string };

const VIRTUAL_SERVER_UTILS_ID = 'virtual:azure-net-kit/server-utils';
const VIRTUAL_UNIVERSAL_UTILS_ID = 'virtual:azure-net-kit/universal-utils';
const RESOLVED_VIRTUAL_SERVER_UTILS_ID = `\0${VIRTUAL_SERVER_UTILS_ID}`;
const RESOLVED_VIRTUAL_UNIVERSAL_UTILS_ID = `\0${VIRTUAL_UNIVERSAL_UTILS_ID}`;
const VIRTUAL_SERVER_HOOKS_ID = 'virtual:azure-net-kit/hooks.server';
const VIRTUAL_CLIENT_HOOKS_ID = 'virtual:azure-net-kit/hooks.client';
const RESOLVED_VIRTUAL_SERVER_HOOKS_ID = `\0${VIRTUAL_SERVER_HOOKS_ID}`;
const RESOLVED_VIRTUAL_CLIENT_HOOKS_ID = `\0${VIRTUAL_CLIENT_HOOKS_ID}`;
const VIRTUAL_PROGRAM_ID = 'virtual:azure-net-kit/program';
const RESOLVED_VIRTUAL_PROGRAM_ID = `\0${VIRTUAL_PROGRAM_ID}`;
const GENERATED_MARKER = '__AZURE_NET_KIT_VIRTUAL_HOOK__';
const SYNC_MARKER = "void '__EDGES_SYNC_WRAPPED__';";
const LOAD_EXPORT_PATTERN = /export\s+const\s+load\s*(?::\s*[^=]+)?=/;
const ACTIONS_EXPORT_PATTERN = /export\s+const\s+actions\s*(?::\s*[^=]+)?=/;
const SERVER_ROUTE_PATTERN = /[\\/]\+((page|layout)\.server)\.(t|j)s$/;
const UNIVERSAL_ROUTE_PATTERN = /[\\/]\+((page|layout))\.(t|j)s$/;
const AST_SERVER_LOAD_ALIAS = '__edgesWrappedServerLoad';
const AST_ACTIONS_ALIAS = '__edgesWrappedActions';
const AST_UNIVERSAL_LOAD_ALIAS = '__edgesWrappedUniversalLoad';

const applyEdits = (sourceCode: string, edits: Edit[]) => {
	if (edits.length === 0) return sourceCode;

	const sorted = edits.sort((a, b) => b.start - a.start);
	let result = sourceCode;

	for (const edit of sorted) {
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	}

	return result;
};

const findImportInsertPosition = (sourceCode: string): number => {
	const importRegex = /(?:^|\n)((?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*|\w+)(?:\s+from)?\s+['"][^'"]+['"];?)/gm;
	let lastMatch: RegExpExecArray | null = null;
	let match: RegExpExecArray | null;

	while ((match = importRegex.exec(sourceCode)) !== null) {
		lastMatch = match;
	}

	return lastMatch ? lastMatch.index + lastMatch[0].length : 0;
};

const findStaticImportInsertPosition = (sourceCode: string): number => {
	const importRegex = /(?:^|\n)(import\s+(?:type\s+)?(?:\{[^}]*\}|\*|\w+)(?:\s+from)?\s+['"][^'"]+['"];?)/gm;
	let lastMatch: RegExpExecArray | null = null;
	let match: RegExpExecArray | null;

	while ((match = importRegex.exec(sourceCode)) !== null) {
		lastMatch = match;
	}

	return lastMatch ? lastMatch.index + lastMatch[0].length : 0;
};

const ensureSyncImport = (sourceCode: string, importLine: string) => {
	if (sourceCode.includes('__EDGES_SYNC_WRAPPED__')) return sourceCode;

	const insertPos = findImportInsertPosition(sourceCode);
	const beforeImports = sourceCode.slice(0, insertPos);
	const afterImports = sourceCode.slice(insertPos);

	return `${beforeImports}\n${SYNC_MARKER}\n${importLine}\n${afterImports}`;
};

const ensureAstServerImport = (sourceCode: string) =>
	ensureSyncImport(
		sourceCode,
		`import { __withEdgesServerLoad as ${AST_SERVER_LOAD_ALIAS}, __withEdgesActions as ${AST_ACTIONS_ALIAS} } from '${VIRTUAL_SERVER_UTILS_ID}';`
	);

const ensureAstUniversalImport = (sourceCode: string) =>
	ensureSyncImport(sourceCode, `import { __withEdgesUniversalLoad as ${AST_UNIVERSAL_LOAD_ALIAS} } from '${VIRTUAL_UNIVERSAL_UTILS_ID}';`);

const ensureRegexServerImport = (sourceCode: string) =>
	ensureSyncImport(sourceCode, `import { __withEdgesServerLoad, __withEdgesActions } from '${VIRTUAL_SERVER_UTILS_ID}';`);

const ensureRegexUniversalImport = (sourceCode: string) =>
	ensureSyncImport(sourceCode, `import { __withEdgesUniversalLoad } from '${VIRTUAL_UNIVERSAL_UTILS_ID}';`);

const findExportedLocal = (sourceFile: ts.SourceFile, code: string, exportedName: 'load' | 'actions') => {
	const edits: Edit[] = [];
	let localName: string | null = null;
	let found = false;

	for (const stmt of sourceFile.statements) {
		if (ts.isVariableStatement(stmt)) {
			const exportModifier = stmt.modifiers?.find((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
			if (!exportModifier) continue;

			for (const declaration of stmt.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportedName) continue;

				localName = declaration.name.text;
				found = true;

				const modifierStart = exportModifier.getStart(sourceFile);
				let modifierEnd = exportModifier.end;
				while (modifierEnd < code.length && /\s/.test(code[modifierEnd])) modifierEnd += 1;
				edits.push({ start: modifierStart, end: modifierEnd, text: '' });
				break;
			}
		}

		if (!ts.isExportDeclaration(stmt) || !stmt.exportClause || !ts.isNamedExports(stmt.exportClause) || stmt.moduleSpecifier) continue;

		const keepSpecs: string[] = [];
		let statementHasTarget = false;

		for (const element of stmt.exportClause.elements) {
			const exportName = element.name.text;
			const sourceName = element.propertyName?.text ?? element.name.text;

			if (exportName === exportedName) {
				statementHasTarget = true;
				found = true;
				localName = sourceName;
				continue;
			}

			keepSpecs.push(code.slice(element.getStart(sourceFile), element.end).trim());
		}

		if (!statementHasTarget) continue;

		if (keepSpecs.length === 0) {
			edits.push({ start: stmt.getStart(sourceFile), end: stmt.end, text: '' });
		} else {
			edits.push({ start: stmt.getStart(sourceFile), end: stmt.end, text: `export { ${keepSpecs.join(', ')} };` });
		}
	}

	return { localName, edits, found };
};

const wrapServerRouteModuleRegex = (sourceCode: string) => {
	if (!LOAD_EXPORT_PATTERN.test(sourceCode) && !ACTIONS_EXPORT_PATTERN.test(sourceCode)) return null;

	let wrapped = ensureRegexServerImport(sourceCode);

	if (LOAD_EXPORT_PATTERN.test(wrapped)) {
		wrapped = wrapped
			.replace(LOAD_EXPORT_PATTERN, (match) => match.replace('export const load', 'const __userLoad'))
			.concat('\n\nexport const load = __withEdgesServerLoad(__userLoad);');
	}

	if (ACTIONS_EXPORT_PATTERN.test(wrapped)) {
		wrapped = wrapped
			.replace(ACTIONS_EXPORT_PATTERN, (match) => match.replace('export const actions', 'const __userActions'))
			.concat('\n\nexport const actions = __withEdgesActions(__userActions);');
	}

	return wrapped;
};

const wrapUniversalRouteModuleRegex = (sourceCode: string) => {
	if (!LOAD_EXPORT_PATTERN.test(sourceCode)) return null;

	return ensureRegexUniversalImport(sourceCode)
		.replace(LOAD_EXPORT_PATTERN, (match) => match.replace('export const load', 'const __userUniversalLoad'))
		.concat('\n\nexport const load = __withEdgesUniversalLoad(__userUniversalLoad);');
};

const wrapServerRouteModuleAst = (sourceCode: string) => {
	if (sourceCode.includes('__EDGES_SYNC_WRAPPED__')) return null;

	let sourceFile: ts.SourceFile;
	try {
		sourceFile = ts.createSourceFile('route.ts', sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	} catch {
		return null;
	}

	const loadInfo = findExportedLocal(sourceFile, sourceCode, 'load');
	const actionsInfo = findExportedLocal(sourceFile, sourceCode, 'actions');

	if (!loadInfo.found && !actionsInfo.found) return null;
	if ((loadInfo.found && !loadInfo.localName) || (actionsInfo.found && !actionsInfo.localName)) return null;

	let nextCode = applyEdits(sourceCode, [...loadInfo.edits, ...actionsInfo.edits]);
	nextCode = ensureAstServerImport(nextCode);

	const append: string[] = [];
	if (loadInfo.localName) {
		append.push(`const __edgesServerLoad = ${AST_SERVER_LOAD_ALIAS}(${loadInfo.localName});`);
		append.push('export { __edgesServerLoad as load };');
	}
	if (actionsInfo.localName) {
		append.push(`const __edgesServerActions = ${AST_ACTIONS_ALIAS}(${actionsInfo.localName});`);
		append.push('export { __edgesServerActions as actions };');
	}

	return `${nextCode}\n\n${append.join('\n')}`;
};

const wrapUniversalRouteModuleAst = (sourceCode: string) => {
	if (sourceCode.includes('__EDGES_SYNC_WRAPPED__')) return null;

	let sourceFile: ts.SourceFile;
	try {
		sourceFile = ts.createSourceFile('route.ts', sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	} catch {
		return null;
	}

	const loadInfo = findExportedLocal(sourceFile, sourceCode, 'load');
	if (!loadInfo.found || !loadInfo.localName) return null;

	let nextCode = applyEdits(sourceCode, [...loadInfo.edits]);
	nextCode = ensureAstUniversalImport(nextCode);

	return `${nextCode}\n\nconst __edgesUniversalLoad = ${AST_UNIVERSAL_LOAD_ALIAS}(${loadInfo.localName});\nexport { __edgesUniversalLoad as load };`;
};

const createVirtualServerHooks = (silentChromeDevtools: boolean) => `// ${GENERATED_MARKER}
import { edgesHandle } from '${VIRTUAL_SERVER_UTILS_ID}';
import { register } from '${VIRTUAL_PROGRAM_ID}';

export const init = register.serverInit;

export const handle = edgesHandle(({ serialize, edgesEvent, resolve }) =>
	register.handle({
		event: edgesEvent,
		resolve: (event, options) =>
			resolve(event, {
				...options,
				transformPageChunk: async (chunk) => {
					const html = options?.transformPageChunk ? await options.transformPageChunk(chunk) : chunk.html;
					return serialize(html);
				}
			})
	})
${silentChromeDevtools ? ')' : ', false)'};

export const handleError = register.serverError;
`;

const createVirtualServerUtils = () =>
	"export { edgesHandle, edgesHandleRaw, __autoWrapHandle, __withEdgesServerLoad, __withEdgesActions } from '@azure-net/edges/server';";

const createVirtualUniversalUtils = () => `const EDGES_STATE_FIELD = '__edges_state__';
const EDGES_REV_FIELD = '__edges_rev__';

const isObjectRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export const __withEdgesUniversalLoad = (load) => {
\tconst wrapped = async (...args) => {
\t\tconst event = args[0];
\t\tconst result = await load(...args);
\t\tif (!isObjectRecord(event?.data)) return result;

\t\tconst inheritedState = event.data[EDGES_STATE_FIELD];
\t\tconst inheritedRev = event.data[EDGES_REV_FIELD];
\t\tif (!inheritedState) return result;

\t\tif (isObjectRecord(result)) {
\t\t\treturn {
\t\t\t\t...result,
\t\t\t\t[EDGES_STATE_FIELD]: inheritedState,
\t\t\t\t[EDGES_REV_FIELD]: inheritedRev
\t\t\t};
\t\t}

\t\tif (result === undefined) {
\t\t\treturn {
\t\t\t\t[EDGES_STATE_FIELD]: inheritedState,
\t\t\t\t[EDGES_REV_FIELD]: inheritedRev
\t\t\t};
\t\t}

\t\treturn result;
\t};

\treturn wrapped;
};
`;

const createVirtualClientHooks = () => `// ${GENERATED_MARKER}
import { register } from '${VIRTUAL_PROGRAM_ID}';

export const init = register.clientInit;
export const handleError = register.clientError;
`;

const createVirtualProgram = (root: string) => {
	const tsProgram = path.join(root, 'src', 'program.ts');
	const jsProgram = path.join(root, 'src', 'program.js');

	if (fs.existsSync(tsProgram)) return `export { register } from '/src/program.ts';`;
	if (fs.existsSync(jsProgram)) return `export { register } from '/src/program.js';`;

	return `import { createApp } from '@azure-net/kit';

export const { register, App } = createApp((app) => app);
`;
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
	const transformed = ensureVirtualImport(sourceCode, `// ${GENERATED_MARKER}\n${importLine}`).replace(
		/export\s+async\s+function\s+get_hooks\s*\(\)\s*\{[\s\S]*?\n\}/m,
		getHooksReplacement
	);

	return transformed;
};

const transformGeneratedClientApp = (sourceCode: string) => {
	if (sourceCode.includes(GENERATED_MARKER)) return null;

	let transformed = ensureVirtualImport(sourceCode, `// ${GENERATED_MARKER}\nimport * as __azureNetClientHooks from '${VIRTUAL_CLIENT_HOOKS_ID}';`);
	transformed = transformed.replace(/import\s+\*\s+as\s+client_hooks\s+from\s+['"][^'"]*hooks\.client\.(?:ts|js)['"];\s*\n*/g, '');

	transformed = transformed.replace(
		/handleError:\s*(?:client_hooks\.handleError\s*\|\|\s*)?\(\(\{\s*error\s*\}\)\s*=>\s*\{\s*console\.error\(error\)\s*\}\)/m,
		'handleError: __azureNetClientHooks.handleError'
	);

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
	const { silentChromeDevtools = true, syncFromServer = true, syncTransformMode = 'hybrid' } = options || {};

	let root = process.cwd();
	let isTestMode = false;

	return {
		name: 'azure-net-kit-plugin',
		enforce: 'pre',

		config(config, env) {
			root = path.resolve(config.root ?? process.cwd());
			isTestMode = env.mode === 'test';
			assertNoUserHooks(root);
		},

		configResolved(config) {
			root = config.root;
			isTestMode ||= config.mode === 'test';
			assertNoUserHooks(root);
		},

		buildStart() {
			assertNoUserHooks(root);
		},

		resolveId(id) {
			if (id === VIRTUAL_SERVER_UTILS_ID) return RESOLVED_VIRTUAL_SERVER_UTILS_ID;
			if (id === VIRTUAL_UNIVERSAL_UTILS_ID) return RESOLVED_VIRTUAL_UNIVERSAL_UTILS_ID;
			if (id === VIRTUAL_SERVER_HOOKS_ID) return RESOLVED_VIRTUAL_SERVER_HOOKS_ID;
			if (id === VIRTUAL_CLIENT_HOOKS_ID) return RESOLVED_VIRTUAL_CLIENT_HOOKS_ID;
			if (id === VIRTUAL_PROGRAM_ID) return RESOLVED_VIRTUAL_PROGRAM_ID;
			return null;
		},

		load(id) {
			if (id === RESOLVED_VIRTUAL_SERVER_UTILS_ID) return createVirtualServerUtils();
			if (id === RESOLVED_VIRTUAL_UNIVERSAL_UTILS_ID) return createVirtualUniversalUtils();
			if (id === RESOLVED_VIRTUAL_SERVER_HOOKS_ID) return createVirtualServerHooks(silentChromeDevtools);
			if (id === RESOLVED_VIRTUAL_CLIENT_HOOKS_ID) return createVirtualClientHooks();
			if (id === RESOLVED_VIRTUAL_PROGRAM_ID) return createVirtualProgram(root);
			return null;
		},

		transform(code, id) {
			const normalizedId = id.split(path.sep).join('/');

			if (!isTestMode && normalizedId.endsWith('/.svelte-kit/generated/server/internal.js')) {
				const transformed = transformGeneratedServerInternal(code);
				if (transformed) return { code: transformed, map: null };
				return null;
			}

			if (
				!isTestMode &&
				(normalizedId.endsWith('/.svelte-kit/generated/client/app.js') || normalizedId.endsWith('/.svelte-kit/generated/client-optimized/app.js'))
			) {
				const transformed = transformGeneratedClientApp(code);
				if (transformed) return { code: transformed, map: null };
				return null;
			}

			if (code.includes('__EDGES_SYNC_WRAPPED__')) return null;

			if (syncFromServer && SERVER_ROUTE_PATTERN.test(id) && !id.includes('hooks.server')) {
				const wrapped =
					syncTransformMode === 'regex'
						? wrapServerRouteModuleRegex(code)
						: syncTransformMode === 'ast'
							? wrapServerRouteModuleAst(code)
							: (wrapServerRouteModuleAst(code) ?? wrapServerRouteModuleRegex(code));

				if (wrapped) return { code: wrapped, map: null };
			}

			if (syncFromServer && UNIVERSAL_ROUTE_PATTERN.test(id) && !id.includes('.server.')) {
				const wrapped =
					syncTransformMode === 'regex'
						? wrapUniversalRouteModuleRegex(code)
						: syncTransformMode === 'ast'
							? wrapUniversalRouteModuleAst(code)
							: (wrapUniversalRouteModuleAst(code) ?? wrapUniversalRouteModuleRegex(code));

				if (wrapped) return { code: wrapped, map: null };
			}

			return null;
		}
	};
};
