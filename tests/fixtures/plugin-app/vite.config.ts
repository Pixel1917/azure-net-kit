import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { AzureNetPlugin } from '@azure-net/kit/plugin';
import adapter from '@sveltejs/adapter-auto';

export default defineConfig({
	plugins: [sveltekit({ adapter: adapter(), compilerOptions: { experimental: { async: true } } }), AzureNetPlugin()]
});
