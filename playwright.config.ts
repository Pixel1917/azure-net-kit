import { defineConfig } from '@playwright/test';

export default defineConfig({
	use: {
		baseURL: 'http://127.0.0.1:4173'
	},
	webServer: {
		command: 'pnpm exec vite build && pnpm exec vite preview --host 127.0.0.1',
		url: 'http://127.0.0.1:4173/e2e',
		reuseExistingServer: false
	},
	testDir: 'e2e'
});
