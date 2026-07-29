import { test, expect } from './fixtures';

test.describe('Authentication Flow', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page should have expected fields from seeded DB', async ({ page }) => {
    await page.goto('/login');
    // Since the database is seeded by global.setup.ts, we should see the traditional login form.
    await expect(page.getByPlaceholder('admin')).toBeVisible();
    await expect(page.getByPlaceholder('••••')).toBeVisible();
    await expect(page.getByRole('button', { name: /Authorize Entry/i })).toBeVisible();
  });

  test('rejects an incorrect PIN', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin').fill('admin');
    await page.getByPlaceholder('••••').fill('0000');
    await page.getByRole('button', { name: /Authorize Entry/i }).click();

    // Should stay on login, not reach the dashboard
    await expect(page).toHaveURL(/\/login/);
  });

  test('logs in successfully with the seeded admin credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin').fill('admin');
    await page.getByPlaceholder('••••').fill('1234');
    await page.getByRole('button', { name: /Authorize Entry/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByText(/Today's Sales/i)).toBeVisible();
  });
});
