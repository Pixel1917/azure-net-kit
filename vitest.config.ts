import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			include: ['tests/**/*.test.ts'],
			exclude: [
				'tests/queryReactivity.test.ts',
				'tests/querySearchParams.test.ts',
				'tests/activeFormReactivity.test.ts',
				'tests/effectReactivity.test.ts',
				'tests/integration/**',
				'e2e/**',
				'dist/**',
				'node_modules/**'
			],
			environment: 'node'
		}
	})
);
