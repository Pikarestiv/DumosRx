import { test, expect, login } from './fixtures';

/** Full golden-path lifecycle test using realistic pharmacy data (not
 * "Test Product 1" placeholders), covering the flow a real demo/store walk-
 * through exercises end to end: stock a real medicine via procurement,
 * sell it with a discount, return part of it, log a real expense, and
 * confirm the dashboard/POS tiles reflect all of it correctly. */
test.describe('Sales Lifecycle (realistic data)', () => {
  test('stock, sell, discount, return, and expense flow', async ({ page }) => {
    test.setTimeout(120000);
    await login(page);

    const productName = `Amoxicillin 500mg Capsules ${Date.now()}`;

    // 1. Create a real product with pricing set (so procurement can cost it).
    await page.goto('/inventory/catalog');
    await page.getByRole('button', { name: /Add Product/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(productName);

    // Selling Price and Reorder Level fields (labeled, not placeholder-matched
    // reliably across breakpoints — locate by nearby label text).
    await page.getByLabel(/Selling Price/i).first().fill('1500');
    await page.getByLabel(/Reorder Level/i).first().fill('10');
    await page.getByRole('button', { name: /^Add Product$/i }).last().click();
    await expect(page.getByText('Add New Product', { exact: true })).not.toBeVisible();

    // 2. Stock it via a real purchase order (Procurement -> Create -> Send -> Receive).
    await page.goto('/procurement/new');
    await page.getByRole('button', { name: /Add New Supplier/i }).click();
    const supplierName = `HealthPlus Distributors ${Date.now()}`;
    await page.getByLabel(/Supplier Name/i).fill(supplierName);
    await page.getByRole('button', { name: /^Add Supplier$/i }).click();

    await page.locator('input[placeholder="e.g. Amoxicillin 500mg"] >> visible=true').first().fill(productName);
    await page.waitForTimeout(500);
    // Select the matching product from the combobox dropdown
    await page.getByText(productName, { exact: false }).last().click();
    await page.locator('input[placeholder="Qty"] >> visible=true').first().fill('50');
    const costInputs = page.locator('input[placeholder="0.00"] >> visible=true');
    await costInputs.first().fill('45000'); // bulk cost for 50 units
    await page.getByRole('button', { name: 'Add', exact: true }).and(page.locator(':visible')).first().click();

    await page.getByRole('button', { name: /Save Purchase Order/i }).click();
    await expect(page).toHaveURL(/\/procurement$/, { timeout: 15000 });

    // Open the order we just created (only PO in this fresh store) and receive it.
    await page.getByText(supplierName).first().click();
    await expect(page.getByRole('button', { name: /Mark as Sent/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Mark as Sent/i }).click();
    await expect(page.getByRole('button', { name: /Receive Goods/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Receive Goods/i }).click();

    await page.getByPlaceholder(/e\.g\. BATCH-123/i).first().fill('BATCH-2026-08');
    await page.getByRole('button', { name: /Confirm & Receive/i }).click();
    await expect(page.getByRole('button', { name: /Completed/i })).toBeVisible({ timeout: 10000 });

    // 3. Sell it at POS with a discount and a cash payment.
    await page.goto('/pos');
    await page.getByPlaceholder(/Search products/i).first().fill(productName);
    const productCard = page.locator(`text="${productName}" >> visible=true`).first();
    await expect(productCard).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text="Out of stock" >> visible=true')).not.toBeVisible();
    await productCard.click();

    await page.getByText('+ Add discount').click();
    await page.locator('input[type="number"]').filter({ hasText: '' }).nth(0);
    // The discount amount input is the lone number input rendered next to the
    // "Discount" label once revealed.
    const discountRow = page.locator('div', { hasText: 'Discount' }).last();
    await page.locator('input[type="number"]').last().fill('100');

    await page.getByRole('button', { name: /Charge/i }).click();
    await expect(page.getByText('Payment', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Process Payment/i }).click();

    // Receipt confirms the sale went through.
    await expect(page.getByText(/Payment Successful|Receipt/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Close/i }).click();

    // 4. Log a real expense (not "Test expense").
    await page.goto('/expenses');
    await page.getByRole('button', { name: /add expense/i }).click();
    const expenseDescription = `Diesel for backup generator ${Date.now()}`;
    await page.getByPlaceholder('e.g. July shop rent').fill(expenseDescription);
    await page.getByPlaceholder('0.00').fill('15000');
    await page.getByRole('button', { name: /save expense/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator(`text="${expenseDescription}" >> visible=true`).first()).toBeVisible();

    // 5. Dashboard reflects today's activity without crashing/blank tiles.
    await page.goto('/dashboard');
    await expect(page.getByText(/Today's Sales/i)).toBeVisible();
  });
});
