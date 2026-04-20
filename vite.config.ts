import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { createEdgesPluginFactory } from '@azure-net/edges/plugin';

export const edgesPlugin = createEdgesPluginFactory('$lib', '$lib/edges/server');

export default defineConfig({
	plugins: [sveltekit(), edgesPlugin()],
	server: {
		port: 5178
	}
});
