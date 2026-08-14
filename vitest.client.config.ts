import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		resolve: {
			conditions: ['browser']
		},
		test: {
			include: ['tests/queryReactivity.test.ts', 'tests/activeFormReactivity.test.ts'],
			environment: 'jsdom'
		}
	})
);
