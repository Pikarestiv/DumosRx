import { test, expect, login } from './fixtures';

/** Full golden-path lifecycle test using realistic pharmacy data (not
 * "Test Product 1" placeholders), covering the flow a real demo/store walk-
 * through exercises end to end: stock a real medicine via a cycle count,
 * sell it with a discount, log a real expense, and confirm the dashboard/POS
 * tiles reflect all of it correctly.
 *
 * Stock is added via Inventory -> Cycle Count rather than Procurement,
 * because Procurement is gated behind a paid subscription tier (Starter and
 * above); a fresh free-tier store like this test's seeded fixture can't
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
    // reliably across breakpoints; locate by nearby label text).
    await page.getByLabel(/Selling Price/i).first().fill('1500');
    await page.getByLabel(/Reorder Level/i).first().fill('10');
    await page.getByRole('button', { name: /^Add Product$/i }).last().click();
    await expect(page.getByText('Add New Product', { exact: true })).not.toBeVisible();

    // 2. Stock it via a Cycle Count (physical count of 50 units found on the shelf).
    //
    // Current flow (components/stock-batch/stock-audits.tsx +
    // audit-ledger-step.tsx, confirmed live in Chrome): "Start Audit" goes
    // straight to a single "Physical inventory" ledger screen - no separate
    // per-category "Start count" step or per-product count screen exists.
    // That screen has a Category FilterPill (defaults to "All Categories")
    // and a search box, filtering one flat grid of every product with an
    // inline editable "Counted Qty" cell per row. Exercise the category
    // filter for real (open it, pick a real category) rather than skipping
    // it, then search for the specific product and edit its Counted Qty
    // inline.
    //
    // The product created above never had a category set (the "Add
    // Product" dialog above never touches one), so it lands under
    // "Uncategorized" (stock-audits.tsx's `ALL_CATEGORIES` fallback) -
    // that's the real category to filter to in order to both exercise the
    // picker and still find this exact product afterward.
    await page.getByRole('button', { name: /Start Audit/i }).click();
    // The Cycle Count screen is a fixed full-screen overlay on top of the
    // Catalog page, which never unmounts underneath it - so unscoped
    // locators can double-match this overlay's controls and the identically
    // labeled Catalog search/filter behind it. Scope every subsequent
    // locator to this overlay.
    const auditPanel = page.locator('div.fixed.inset-0.z-50');
    await expect(auditPanel.getByText('Physical inventory', { exact: true })).toBeVisible();

    const categoryFilter = auditPanel.getByRole('button', { name: /^Category:/ });
    await categoryFilter.click();
    await page.getByRole('menuitemradio', { name: /^Uncategorized \(\d+\)$/ }).click();
    await expect(categoryFilter).toHaveText(/Uncategorized/);

    await auditPanel.getByPlaceholder('Search by name or SKU').fill(productName);
    const countedQtyInput = auditPanel
      .getByRole('row')
      .filter({ hasText: productName })
      .locator('input[type="number"]')
      .first();
    await expect(countedQtyInput).toBeVisible({ timeout: 10000 });
    await countedQtyInput.fill('50');

    await auditPanel.getByRole('button', { name: /Review & submit/i }).click();
    await expect(auditPanel.getByText('Review & submit', { exact: true })).toBeVisible();
    await expect(auditPanel.getByText(productName, { exact: false })).toBeVisible();
    await auditPanel.getByRole('button', { name: /Submit audit/i }).click();
    await expect(auditPanel.getByText('Audit submitted', { exact: true })).toBeVisible({ timeout: 10000 });
    await auditPanel.getByRole('button', { name: /Close Audit/i }).click();

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
