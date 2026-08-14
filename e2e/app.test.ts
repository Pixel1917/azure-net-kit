import { expect, test } from '@playwright/test';

test('renders through SSR and hydrates client interactions', async ({ page }) => {
	const response = await page.goto('/e2e?page=4&enabled=true&utm_source=e2e');

	expect(response?.status()).toBe(200);
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
