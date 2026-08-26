import { test, expect, login } from './fixtures';

test.describe('Sales Module', () => {
  test('should log in and navigate to POS page', async ({ page }) => {
    await login(page);

    // Navigate to POS terminal via sidebar
    await page.locator('a[href="/pos"]').first().click();

    // Check that POS interface loads (components/pos/pos-cart.tsx renders "Charge <amount>").
    // The search input renders twice (desktop header + mobile row); scope to the first.
    await expect(page.getByRole('button', { name: /Charge/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search products/i).first()).toBeVisible();
  });

  test('a product with no stock shows as Out of stock and cannot be sold', async ({ page }) => {
    await login(page);

    // The seeded test store has no products yet, so create one via the catalog.
    // The quick-add form has no initial-stock fields (removed by design: stock
    // is only ever added via receiving a purchase order or a stock audit), so
    // a freshly created product always starts at zero stock.
    await page.goto('/inventory/catalog');
    await page.getByRole('button', { name: /Add Product/i }).click();
    const productName = `E2E Cart Test Product ${Date.now()}`;
    await page.getByRole('dialog').getByRole('textbox').first().fill(productName);
    await page.getByRole('button', { name: /^Add Product$/i }).last().click();

    // Selling Price / Reorder Level were left blank, so the app warns before
    // saving ("Missing details ... Continue anyway?"); confirm through it.
    await page.getByRole('button', { name: /Continue Anyway/i }).click();
    await expect(page.getByText('Add New Product', { exact: true })).not.toBeVisible();

    await page.goto('/pos');
    await page.getByPlaceholder(/Search products/i).first().fill(productName);

    const productCard = page.locator(`text="${productName}" >> visible=true`).first();
    await expect(productCard).toBeVisible();
    await expect(page.locator('text="Out of stock" >> visible=true')).toBeVisible();

    // Clicking an out-of-stock product must not add it to the cart.
    await productCard.click();
    await expect(page.locator('text="Cart is empty" >> visible=true')).toBeVisible();
  });
});
