import { test, expect, login } from './fixtures';

test.describe('Dashboard Module', () => {
  test('should log in and render dashboard stat cards', async ({ page }) => {
    await login(page);

    // Check for dashboard stats (components/dashboard/dashboard-overview.tsx)
    await expect(page.getByText(/Today's Sales/i)).toBeVisible();
    await expect(page.getByText(/Total Products/i)).toBeVisible();
    await expect(page.getByText(/Inventory Value/i)).toBeVisible();
    await expect(page.getByText(/Orders Today/i)).toBeVisible();
  });

  test('New Sale button navigates to the POS terminal', async ({ page }) => {
    await login(page);

    await page.getByRole('button', { name: /New Sale/i }).click();
    await expect(page).toHaveURL(/\/pos/);
  });

  test('sidebar links navigate to their respective pages', async ({ page }) => {
    await login(page);

    await page.locator('a[href="/inventory"]').first().click();
    await expect(page).toHaveURL(/\/inventory/);
    await expect(page.locator('header').getByText('Inventory Dashboard', { exact: true })).toBeVisible();

    await page.locator('a[href="/customers"]').first().click();
    await expect(page).toHaveURL(/\/customers/);
    await expect(page.getByText('Customer Management', { exact: true })).toBeVisible();
  });
});
