import { test, expect, login } from './fixtures';
import { queryLocalDb } from './local-db';

test('a paid store keeps its dark theme across a reload', async ({ page }) => {
  await login(page);
  expect(await queryLocalDb(page, 'SELECT subscription_tier FROM stores')).toEqual([{ subscription_tier: 'pro' }]);

  await page.locator('a[href="/settings"]').first().click();
  await expect(page.getByRole('tab', { name: 'General', selected: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/, { timeout: 3000 });
});
