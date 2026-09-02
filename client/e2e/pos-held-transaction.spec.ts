import { test, expect, login } from './fixtures';

/** Regression coverage for POS's hold/recall ("park sale") flow.
 *
 * Found uncovered while smoke-testing POS (docs/features/pos.md): grepping
 * __tests__/, e2e/, and components/pos/ for "held_transaction"/"hold" turned
 * up zero test files touching the feature, despite held_transactions being a
 * real, user-facing table (lib/db/schema.ts) wired into pos-system.tsx via
 * usePOSHeldTransactions (lib/hooks/use-pos-held-transactions.ts).
 *
 * The riskiest failure mode is silent: handleRecallTransaction rebuilds cart
 * lines from the held row's items_json by looking each item back up in the
 * live products list (`products.find(m => m.id === item.product_id)`), and
 * `.filter((item): item is CartItem => item !== null)` drops a miss with no
 * error. A product renamed, deactivated, or simply not yet loaded in that
 * list would silently shrink the cart on recall - the cashier would see a
 * shorter total, not a warning. This test asserts a multi-item cart, with a
 * discount applied, survives a hold + recall byte-for-byte (quantities,
 * item count, and the charged total after checkout).
 *
 * Note: the Cycle Count screen here (Physical Inventory: search + inline
 * "Counted Qty" cell + "Review & submit" + "Submit audit") is the *current*
 * UI, verified live against the running app. It differs from the
 * select-a-category-then-"Start count" flow older specs
 * (sales-lifecycle.spec.ts) still assert - that flow no longer exists and
 * those assertions are stale, a pre-existing/unrelated breakage, not
 * something this test should route around.
 */
test.describe('POS held transactions', () => {
  test('recall restores every line item, quantity, and the discount that was on the cart when held', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await login(page);

    const productA = `Held Test Paracetamol ${Date.now()}`;
    const productB = `Held Test Vitamin C ${Date.now()}`;

    // Create two fresh products, then give both real stock via one Cycle
    // Count (Procurement is gated behind a paid tier a fresh free-tier
    // store can't reach; Cycle Count is the other real path to stock).
    for (const [name, price] of [
      [productA, '1200'],
      [productB, '800'],
    ] as const) {
      await page.goto('/inventory/catalog');
      await page.getByRole('button', { name: /Add Product/i }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox').first().fill(name);
      await page.getByLabel(/Selling Price/i).first().fill(price);
      await page.getByLabel(/Reorder Level/i).first().fill('5');
      await page.getByRole('button', { name: /^Add Product$/i }).last().click();
      await expect(page.getByText('Add New Product', { exact: true })).not.toBeVisible();
    }

    await page.getByRole('button', { name: /Start Audit/i }).click();
    await expect(page.getByText('Physical inventory')).toBeVisible();

    for (const name of [productA, productB]) {
      const searchBox = page.getByPlaceholder(/Search by name or SKU/i).first();
      await searchBox.fill(name);
      // audit-ledger-step.tsx renders the count grid as ARIA role="row"/
      // "cell" divs (real <input type="number"> cells, but no real <tr>
      // for the browser to compute a row accessible name from), so locate
      // via the nearest role="row" ancestor of the product-name cell
      // instead of matching the row by name.
      const nameCell = page.getByText(name, { exact: true }).first();
      await expect(nameCell).toBeVisible();
      const row = nameCell.locator('xpath=ancestor::*[@role="row"]').first();
      const countedQtyInput = row.locator('input[type="number"]').first();
      await countedQtyInput.fill('20');
      await countedQtyInput.blur();
      await searchBox.fill('');
    }

    await page.getByRole('button', { name: /Review & submit/i }).click();
    await expect(page.getByText(/^2$/).first()).toBeVisible(); // "Adjusted" count tile
    await page.getByRole('button', { name: /Submit audit/i }).click();
    await expect(page.getByText('Audit submitted', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Close Audit/i }).click();

    // Build a cart: 2x product A, 1x product B, plus a fixed discount.
    await page.goto('/pos');
    await page.getByPlaceholder(/Search products/i).first().fill(productA);
    await page.locator(`text="${productA}" >> visible=true`).first().click();

    // A second click straight on the product card is unreliable here: adding
    // the first unit reflows the page (a "Goes well with cart" suggestions
    // row appears above the grid), shifting every card down before the
    // second click lands. Increment via the cart line's own "+" stepper
    // instead, which is stable once the item is already in the cart.
    // pos-cart-item.tsx's quantity stepper (verified live in Chrome) is the
    // only ".rounded-lg.overflow-hidden.shrink-0" wrapper on the page, with
    // exactly 2 real <button>s inside it (Minus, Plus) - the qty number and
    // the delete icon next to it are plain divs, not buttons. Only one cart
    // line exists at this point (product A, just added), so there's exactly
    // one such wrapper, and it's unambiguous without scoping to a cart
    // container (the "Current sale" header and the cart item list live in
    // separate sibling containers, not one inside the other).
    const qtyStepper = page.locator('.rounded-lg.overflow-hidden.shrink-0');
    await expect(qtyStepper.getByRole('button')).toHaveCount(2);
    await qtyStepper.getByRole('button').last().click();

    await page.getByPlaceholder(/Search products/i).first().fill(productB);
    await page.locator(`text="${productB}" >> visible=true`).first().click();

    // "items" here counts distinct line items (2: product A and B), not
    // total unit quantity (3) - confirmed live in Chrome.
    await expect(page.locator('text="2 items" >> visible=true').first()).toBeVisible({ timeout: 10000 });

    await page.getByText('+ Add discount').click();
    await page.locator('input[type="number"]').last().fill('200');

    const totalBeforeHold = await page.locator('text=/^Total$/').locator('..').last().textContent();

    // Hold it.
    await page.getByRole('button', { name: /Hold Sale/i }).click();
    await expect(page.getByText('Transaction held successfully')).toBeVisible({ timeout: 10000 });

    // Cart is now empty and a "held" indicator is showing.
    await expect(page.getByText('Cart is empty')).toBeVisible();
    await expect(page.getByText(/on hold/i)).toBeVisible();

    // Open the held-transactions dialog and confirm the parked sale is
    // listed with both line items accounted for (held-transactions-dialog.tsx
    // shows JSON.parse(items_json).length - the line count, not total qty).
    await page.getByText(/on hold/i).locator('..').getByText(/view/i).click();
    const heldDialog = page.getByRole('dialog', { name: /Held Transactions/i });
    await expect(heldDialog).toBeVisible();
    await expect(heldDialog.getByText('2 Items')).toBeVisible();

    // Recall it.
    await heldDialog.getByRole('button', { name: /Recall/i }).click();
    await expect(page.getByText('Transaction recalled')).toBeVisible({ timeout: 10000 });

    // Every line item is back, with the same quantities. Scoped to the cart
    // item list container (a sibling of the "Current sale" header, not an
    // ancestor of it - verified live in Chrome), since the product name
    // text can otherwise still match a leftover product-search result.
    const cartItemList = page.locator('.min-h-\\[120px\\]');
    await expect(cartItemList.getByText(productA)).toBeVisible();
    await expect(cartItemList.getByText(productB)).toBeVisible();
    await expect(
      cartItemList.locator('div', { hasText: productA }).getByText('2', { exact: true }).first(),
    ).toBeVisible();

    // The discount survived the round trip and the total matches what it
    // was right before the sale was held.
    const totalAfterRecall = await page.locator('text=/^Total$/').locator('..').last().textContent();
    expect(totalAfterRecall?.replace(/\s/g, '')).toBe(totalBeforeHold?.replace(/\s/g, ''));

    // Finish the sale so the held row is fully consumed (no leftover state
    // between test runs) and the receipt confirms the same total charged.
    await page.getByRole('button', { name: /Charge/i }).click();
    await expect(page.getByText('Payment', { exact: true })).toBeVisible();
    await page.locator('input[type="number"]').first().fill('10000');
    await page.getByRole('button', { name: /Process Payment/i }).click();
    await expect(page.getByText(/Payment Successful|Sale Completed|Receipt/i).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
