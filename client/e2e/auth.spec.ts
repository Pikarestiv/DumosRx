import { test, expect } from './fixtures';

test.describe('Authentication Flow', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page should have expected fields from seeded DB', async ({ page }) => {
    await page.goto('/login');
    // Since the database is seeded by global.setup.ts, we should see the traditional login form.
    await expect(page.getByPlaceholder(/Enter email or username/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i }).first()).toBeVisible();
  });
});
