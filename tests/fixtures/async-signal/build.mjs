import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

const out = process.argv[2];
for (const server of [true, false]) {
	await build({
		configFile: false,
		plugins: [svelte({ configFile: false, compilerOptions: { experimental: { async: true } } })],
		ssr: { noExternal: true },
		build: {
			ssr: server,
			outDir: path.join(out, server ? 'server' : 'client'),
			lib: {
				entry: path.resolve(`tests/fixtures/async-signal/${server ? 'server' : 'client'}.ts`),
				name: 'AsyncSignalFixture',
				formats: [server ? 'es' : 'iife']
			},
			rollupOptions: { output: { entryFileNames: server ? 'entry.mjs' : 'entry.js', inlineDynamicImports: true } }
		}
	});
}
