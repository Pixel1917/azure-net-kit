import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			include: ['tests/integration/**/*.test.ts'],
			exclude: ['e2e/**', 'dist/**', 'node_modules/**'],
			environment: 'node'
		}
	})
);
