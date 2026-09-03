import { test, expect, login } from './fixtures';

test.describe('Authentication Flow', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page should have expected fields from seeded DB', async ({ page }) => {
    await page.goto('/login');
    // Since the database is seeded by global.setup.ts, we should see the
    // traditional login form (components/auth/traditional-login-form.tsx).
    // This test's whole point is checking the login page's actual fields, so
    // it asserts against them directly rather than going through the shared
    // login() helper. The username field is still a placeholder-based text
    // input ("admin"), but the PIN field switched to an InputOTP (4 slots,
    // no '••••' placeholder) - confirmed both by reading the component and
    // live in Chrome.
    await expect(page.getByPlaceholder('admin')).toBeVisible();
    await expect(page.locator('input[data-input-otp="true"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Authorize Entry/i })).toBeVisible();
  });

  test('rejects an incorrect PIN', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin').fill('admin');
    // PIN field is an InputOTP, not a placeholder-based text input - see the
    // note above and e2e/fixtures.ts's login().
    await page.locator('input[data-input-otp="true"]').first().fill('0000');
    await page.getByRole('button', { name: /Authorize Entry/i }).click();

    // Should stay on login, not reach the dashboard
    await expect(page).toHaveURL(/\/login/);
  });

  test('logs in successfully with the seeded admin credentials', async ({ page }) => {
    // This test only needs to get logged in and check the result - it
    // doesn't need to inspect the login form's own fields (that's covered
    // above), so it can use the shared login() helper directly instead of
    // duplicating the fill-in steps.
    await login(page);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByText(/Today's Sales/i)).toBeVisible();
  });
});
