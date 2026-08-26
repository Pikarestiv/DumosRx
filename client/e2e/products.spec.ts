import { test, expect, login } from './fixtures';

test.describe('Products Module', () => {
  test('should log in and navigate to products page', async ({ page }) => {
    await login(page);

    // Navigate to products via sidebar: /inventory redirects to /inventory/overview,
    // so go to the Catalog tab directly (a click-through would pass the mouse near
    // the collapsed sidebar's hover-peek strip and risk intercepting the tab click).
    await page.locator('a[href="/inventory"]').first().click();
    await expect(page).toHaveURL(/\/inventory\/overview/);
    await page.goto('/inventory/catalog');
    await expect(page.locator('header').getByText('Product Catalog', { exact: true })).toBeVisible();

    // Check that Add Product button exists
    await expect(page.getByRole('button', { name: /Add Product/i })).toBeVisible();
  });

  test('Overview and Ledger tabs also expose the Add Product header action', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/overview');
    await expect(page.locator('header').getByText('Inventory Dashboard', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Product/i })).toBeVisible();

    await page.goto('/inventory/ledger');
    await expect(page.locator('header').getByText('Stock Ledger', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Product/i })).toBeVisible();
  });

  test('quick-add product dialog opens and closes from the Catalog tab', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');

    await page.getByRole('button', { name: /Add Product/i }).click();
    await expect(page.getByText('Add New Product', { exact: true })).toBeVisible();
    // Confirm the primary action button is visible without needing to scroll:
    // regression check for the ResponsiveModal clipping bug fixed this session.
    await expect(page.getByRole('button', { name: /^Add Product$/i }).last()).toBeVisible();

    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByText('Add New Product', { exact: true })).not.toBeVisible();
  });
});
