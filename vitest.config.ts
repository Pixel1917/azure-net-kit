import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			include: ['tests/**/*.test.ts'],
			exclude: ['tests/integration/**', 'e2e/**', 'dist/**', 'node_modules/**'],
			environment: 'node'
		}
	})
);
