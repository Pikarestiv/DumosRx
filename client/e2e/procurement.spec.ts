import { test, expect, loginAsPaidTier } from './fixtures';

/**
 * Procurement is gated behind a paid tier (`!isFree` fallback in
 * lib/hooks/use-feature-gate.ts) via `<LockedModuleOverlay featureKey="procurement" />`
 * in app/(dashboard)/procurement/page.tsx, same as Expenses. The shared e2e
 * fixture (e2e/.auth/test-db.bin) is deliberately free-tier, so both tests
 * here elevate their own isolated per-test copy of the local DB via the
 * shared `loginAsPaidTier` helper (fixtures.ts) instead of touching the
 * shared fixture — see findings-log finding #9 (Expenses), whose exact
 * overlay-mount race root cause also applied here.
 */

test.describe('Procurement Module', () => {
  test('should log in, navigate to procurement, and open create order flow', async ({ page }) => {
    test.setTimeout(60000);
    await loginAsPaidTier(page);

    // 2. Navigate to procurement via sidebar
    await page.locator('a[href="/procurement"]').first().click();
    // Scoped to <header>: the sidebar nav link is also literally "Procurement".
    await expect(page.locator('header').getByText('Procurement', { exact: true })).toBeVisible();

    // 3. Click Create Order
    await page.getByRole('button', { name: /Create Order/i }).first().click();

    // 4. Verify Create Purchase Order page loads (components/procurement/po-order-form-fields.tsx)
    await expect(page.getByText('Create Purchase Order', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    // Both fields render twice: once in the desktop panel, once in the
    // off-screen mobile create-order view. Match the visible instance.
    await expect(page.locator('text="Select Vendor" >> visible=true').first()).toBeVisible();

    // 4b. Continue to the item-entry step (components/procurement/po-item-builder.tsx,
    // introduced in commit 113a368c, replaced the old "Add Items to Order"
    // section/separate-Add-button flow this test used to assert on).
    await page.getByRole('button', { name: /Continue to Add Items/i }).locator('visible=true').first().click();
    await expect(
      page.locator('input[placeholder="Search item by name, SKU or barcode"] >> visible=true').first(),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000); // Wait for animations to settle

    // 5. Test Quick Add Product flow trigger
    // Type a product name that doesn't exist (components/procurement/po-item-builder.tsx
    // -> components/ui/product-combobox.tsx)
    const comboboxInput = page
      .locator('input[placeholder="Search item by name, SKU or barcode"] >> visible=true')
      .first();
    await comboboxInput.evaluate((node: HTMLInputElement) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(node, 'Paracetamol 500mg (Test)');
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Wait a short moment for state to update
    await page.waitForTimeout(500);

    // Click the pinned "Create ... as new product" row — selecting a product
    // combobox option now adds/opens directly, there is no separate "Add"
    // button anymore (product-combobox.tsx's AddNewProductOption).
    await page
      .getByText('Create "Paracetamol 500mg (Test)" as new product', { exact: true })
      .locator('visible=true')
      .first()
      .click();

    // The Quick Add modal should open (Add New Product) with the typed name
    // pre-filled as the Product Name: first textbox in the dialog.
    await expect(page.locator('text="Add New Product" >> visible=true').first()).toBeVisible();
    const addProductDialog = page.getByRole('dialog').filter({ has: page.getByText('Add New Product') });
    await expect(addProductDialog.getByRole('textbox').first()).toHaveValue('Paracetamol 500mg (Test)');
  });

  test('should create a standard purchase order, send it, receive it, and increase product stock', async ({ page }) => {
    test.setTimeout(90000);
    await loginAsPaidTier(page);

    // Closes the exact gap flagged in docs/features/procurement.md: the
    // pre-existing test above only opens the Quick Add Product dialog and
    // never submits/sends/receives an order, so receivePurchaseOrder()
    // (lib/db/procurement-receiving.ts) — the Standard PO receiving path —
    // had zero e2e (or unit) coverage before this test.
    const productName = `E2E PO Product ${Date.now()}`;
    const orderedQty = 5;

    await page.locator('a[href="/procurement"]').first().click();
    await expect(page.locator('header').getByText('Procurement', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Create Order/i }).first().click();
    await expect(page.getByText('Create Purchase Order', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Switch Order Type from the default "Immediate Purchase" to "Purchase
    // Order" (components/procurement/po-details-fields.tsx): Immediate
    // already has solid unit coverage (__tests__/procurement-immediate.test.ts)
    // for createAndReceivePurchaseOrder(); this test targets the separate
    // pending -> sent -> received path (receivePurchaseOrder()) instead.
    await page
      .getByRole('tab', { name: 'Purchase Order', exact: true })
      .locator('visible=true')
      .first()
      .click();

    // Vendor defaults to "Self / Walk-in Purchase" (SELF_PURCHASE_VENDOR_ID
    // in po-details-fields.tsx) — no vendor selection needed.
    await page.getByRole('button', { name: /Continue to Add Items/i }).locator('visible=true').first().click();

    const itemSearch = page
      .locator('input[placeholder="Search item by name, SKU or barcode"] >> visible=true')
      .first();
    await expect(itemSearch).toBeVisible({ timeout: 15000 });

    // The e2e fixture DB (e2e/.auth/test-db.bin) starts from a bare fresh
    // store with an empty catalog, so there's no pre-existing product to
    // search for — create one via the same "Create as new product" flow
    // the test above exercises. po-item-builder.tsx auto-adds it as a line
    // item the moment the dialog resolves (no separate "Add" click).
    await itemSearch.click();
    await itemSearch.evaluate((node: HTMLInputElement, value: string) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, productName);
    await page.waitForTimeout(500);

    await page
      .getByText(`Create "${productName}" as new product`, { exact: true })
      .locator('visible=true')
      .first()
      .click();

    const addProductDialog = page.getByRole('dialog').filter({ has: page.getByText('Add New Product') });
    await expect(addProductDialog).toBeVisible();
    await expect(addProductDialog.getByRole('textbox').first()).toHaveValue(productName);
    await addProductDialog.getByRole('button', { name: /^Add Product$/i }).click();

    // A bare quick-add product is missing Selling Price/Reorder Level
    // (components/products/add-product-dialog.tsx) — confirm through that
    // warning instead of backfilling every field.
    const continueAnyway = page.getByRole('button', { name: /Continue Anyway/i });
    if (await continueAnyway.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueAnyway.click();
    }

    // Confirms the product landed as a line item in the order (po-item-builder.tsx's
    // newlyCreatedProductId auto-add effect).
    const itemRow = page.locator('[role="row"]:visible').filter({ hasText: productName }).first();
    await expect(itemRow).toBeVisible({ timeout: 15000 });

    // Set the ordered quantity (EditableNumberCell — first number input in
    // the Standard-type row is Qty; components/procurement/po-item-ledger-table.tsx).
    const qtyInput = itemRow.locator('input[type="number"]').first();
    await qtyInput.click();
    await qtyInput.fill(String(orderedQty));
    await qtyInput.blur();

    // Save as Draft (components/procurement/po-desktop-create-view.tsx: the
    // primary submit button reads "Save as Draft" for Standard-type orders).
    await page.getByRole('button', { name: /^Save as Draft$/i }).locator('visible=true').first().click();

    // Lands back on /procurement with the new PO's detail panel open
    // (purchase-order-details.tsx).
    await expect(page.getByText(/^Draft$/).first()).toBeVisible({ timeout: 15000 });

    // pending + type !== immediate -> "Mark as Sent" (onSendPO ->
    // updatePurchaseOrderStatus, lib/db/procurement.ts).
    await page.getByRole('button', { name: /Mark as Sent/i }).click();
    await expect(page.getByText(/Order marked as sent/i)).toBeVisible({ timeout: 10000 });

    // status "sent" -> "Receive Goods" opens ReceivePOPanel
    // (components/procurement/receive-po-panel.tsx).
    await page.getByRole('button', { name: /Receive Goods/i }).click();
    await expect(page.getByText('Receive Goods', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Confirm the full ordered quantity, no batch/expiry entered.
    await page.getByRole('button', { name: /Confirm & Receive/i }).click();

    // No expiry date was entered -> confirm the "Missing Expiry Date"
    // warning (receive-po-panel.tsx's AlertDialog).
    const proceedAnyway = page.getByRole('button', { name: /Proceed Anyway/i });
    if (await proceedAnyway.isVisible({ timeout: 5000 }).catch(() => false)) {
      await proceedAnyway.click();
    }

    // receivePurchaseOrder() (lib/db/procurement-receiving.ts) ran: PO is
    // now "received" and stock_batches/stock_movements were inserted.
    await expect(page.getByText('Order received and stock updated!')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^Received$/).first()).toBeVisible({ timeout: 15000 });

    // Assert the exact bit closing the coverage gap: the product's stock
    // increased by the ordered quantity. Check via the Catalog page's
    // stock column (components/products/catalog-list.tsx renders
    // "{stockQuantity} {baseUnit}(s)"), rather than re-deriving the number
    // from stock_batches directly, so this exercises the same read path a
    // real user checking inventory would see.
    await page.goto('/inventory/catalog');
    const catalogSearch = page.locator('input[placeholder="Search by name or SKU"]:visible').first();
    await expect(catalogSearch).toBeVisible({ timeout: 15000 });
    await catalogSearch.click();
    await catalogSearch.fill(productName);
    await page.waitForTimeout(500);

    await expect(page.locator(`text="${productName}" >> visible=true`).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator(`:text-matches("^${orderedQty}\\\\s+unit", "i") >> visible=true`).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
