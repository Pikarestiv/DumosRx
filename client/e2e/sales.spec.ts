import { test, expect } from './fixtures';

test.describe('Sales Module', () => {
  test('should log in and navigate to POS page', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/admin|username/i).first().fill('admin');
    await page.getByPlaceholder(/••••|password|pin/i).first().fill('1234');
    await page.getByRole('button', { name: /Authorize Entry|sign in/i }).first().click();
    
    await expect(page.getByRole('heading', { name: /Overview/i })).toBeVisible({ timeout: 10000 });
    
    // Navigate to POS terminal via sidebar
    await page.locator('a[href="/pos"]').first().click();
    
    // Check that POS interface loads
    await expect(page.getByRole('button', { name: /Complete Sale/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search products/i)).toBeVisible();
  });
});
