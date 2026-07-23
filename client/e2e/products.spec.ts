import { test, expect } from './fixtures';

test.describe('Products Module', () => {
  test('should log in and navigate to products page', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/admin|username/i).first().fill('admin');
    await page.getByPlaceholder(/••••|password|pin/i).first().fill('1234');
    await page.getByRole('button', { name: /Authorize Entry|sign in/i }).first().click();
    
    await expect(page.getByRole('heading', { name: /Overview/i })).toBeVisible({ timeout: 10000 });
    
    // Navigate to products via sidebar
    await page.locator('a[href="/inventory"]').first().click();
    await expect(page.getByRole('heading', { name: /Catalog & Inventory/i }).first()).toBeVisible();
    
    // Check that Add Product button exists
    await expect(page.getByRole('button', { name: /Add Product/i })).toBeVisible();
  });
});
