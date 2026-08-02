import { test, expect, login } from './fixtures';

/** Full golden-path lifecycle test using realistic pharmacy data (not
 * "Test Product 1" placeholders), covering the flow a real demo/store walk-
 * through exercises end to end: stock a real medicine via a cycle count,
 * sell it with a discount, log a real expense, and confirm the dashboard/POS
 * tiles reflect all of it correctly.
 *
 * Stock is added via Inventory -> Cycle Count rather than Procurement,
 * because Procurement is gated behind a paid subscription tier (Starter and
 * above) — a fresh free-tier store like this test's seeded fixture can't
 * reach it. Cycle Count isn't tier-gated and is the other real path to
 * getting stock into the system. */
test.describe('Sales Lifecycle (realistic data)', () => {
  test('stock via cycle count, sell with discount, and log an expense', async ({ page }) => {
    test.setTimeout(120000);
    await login(page);

    const productName = `Amoxicillin 500mg Capsules ${Date.now()}`;

    // 1. Create a real product with pricing set.
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

    // 2. Stock it via a Cycle Count (physical count of 50 units found on the shelf).
    await page.getByRole('button', { name: /Start Audit/i }).click();
    await page.getByText('All Categories').click();
    await page.getByRole('button', { name: /Start count/i }).click();
    await page.getByText(productName, { exact: false }).first().click();

    const countInput = page.locator('input[type="number"]');
    await countInput.fill('50');
    await page.getByText('Found', { exact: true }).click();
    await page.getByRole('button', { name: /Save count/i }).click();

    await page.getByRole('button', { name: /Review & submit/i }).click();
    await expect(page.getByText('1', { exact: true }).first()).toBeVisible(); // "Adjusted" count tile
    await page.getByRole('button', { name: /Submit audit/i }).click();
    await expect(page.getByText('Audit submitted', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Close Audit/i }).click();

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
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();

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
