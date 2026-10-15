import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { AzureNetPlugin } from './src/lib/plugin/index.js';
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [sveltekit({ adapter: adapter(), preprocess: vitePreprocess(), compilerOptions: { experimental: { async: true } } }), AzureNetPlugin()],
	server: {
		port: 5178
	}
});
