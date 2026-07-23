import { test, expect } from './fixtures';

test.describe('Dashboard Module', () => {
  test('should log in and render dashboard components', async ({ page }) => {
    await page.getByPlaceholder(/Enter email or username/i).first().fill('admin');
    await page.keyboard.type('1234');
    await page.getByRole('button', { name: /Sign In/i }).first().click();
    
    await expect(page.getByRole('heading', { name: /Overview/i })).toBeVisible({ timeout: 10000 });
    
    // Check for dashboard stats
    await expect(page.getByText(/Today's Sales/i)).toBeVisible();
    await expect(page.getByText(/Total Products/i)).toBeVisible();
    await expect(page.getByText(/Inventory Value/i)).toBeVisible();
  });
});
