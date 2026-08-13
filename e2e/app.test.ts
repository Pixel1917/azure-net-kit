import { expect, test } from '@playwright/test';

test('renders through SSR and hydrates client interactions', async ({ page }) => {
	const response = await page.goto('/e2e');

	expect(response?.status()).toBe(200);
	await expect(page).toHaveTitle('AzureNet Kit E2E');
	await expect(page.getByRole('heading', { name: 'AzureNet Kit E2E' })).toBeVisible();
	await expect(page.getByTestId('count')).toHaveText('0');

	await page.getByRole('button', { name: 'Increment' }).click();
	await expect(page.getByTestId('count')).toHaveText('1');
});
