import { expect, test } from '@playwright/test';

test('renders through SSR and hydrates client interactions', async ({ page }) => {
	const response = await page.goto('/e2e?page=4&enabled=true&utm_source=e2e');

	expect(response?.status()).toBe(200);
	expect(await response!.text()).toContain('from-server');
	expect(await response!.text()).toContain('en:Public data');
	await expect(page.getByTestId('translation')).toHaveText('en:Public data');
	await page.getByRole('button', { name: 'Russian' }).click();
	await expect(page.getByTestId('translation')).toHaveText('ru:Публичные данные');
	await expect(page.getByTestId('boot-value')).toHaveText('from-server');
	await page.getByRole('button', { name: 'Update boot state' }).click();
	await expect(page.getByTestId('boot-value')).toHaveText('client-edit');
	await expect(page.getByTestId('translation')).toHaveText('ru:Публичные данные');
	await expect(page).toHaveTitle('AzureNet Kit E2E');
	await expect(page.getByRole('heading', { name: 'AzureNet Kit E2E' })).toBeVisible();
	await expect(page.getByTestId('count')).toHaveText('0');

	await page.getByRole('button', { name: 'Increment' }).click();
	await expect(page.getByTestId('count')).toHaveText('1');
	await expect(page.getByTestId('query-page')).toHaveText('4');
	await expect(page.getByTestId('query-enabled')).toHaveText('true');

	await page.getByRole('button', { name: 'Next query page' }).click();
	await expect(page).toHaveURL(/page=5/);
	await expect(page).toHaveURL(/enabled=true/);
	await expect(page).toHaveURL(/utm_source=e2e/);
});

test('hydrates server-selected Russian before rendering and preserves client locale', async ({ page, context }) => {
	await context.addCookies([{ name: 'current-test-language', value: 'ru', domain: '127.0.0.1', path: '/' }]);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (message) => {
		if (message.text().includes('hydration_mismatch')) errors.push(message.text());
	});
	const response = await page.goto('/e2e');
	expect(await response!.text()).toContain('ru:Публичные данные');
	await expect(page.getByTestId('translation')).toHaveText('ru:Публичные данные');
	await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
	expect(errors).toEqual([]);
});
