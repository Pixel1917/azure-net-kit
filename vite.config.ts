import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { AzureNetPlugin } from './src/lib/plugin/index.js';

export default defineConfig({
	plugins: [sveltekit(), AzureNetPlugin()],
	server: {
		port: 5178
	}
});
