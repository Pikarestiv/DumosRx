import { test, expect, login } from './fixtures';

test.describe('Procurement Module', () => {
  test('should log in, navigate to procurement, and open create order flow', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);

    // 2. Navigate to procurement via sidebar
    await page.locator('a[href="/procurement"]').first().click();
    // Scoped to <header> — the sidebar nav link is also literally "Procurement".
    await expect(page.locator('header').getByText('Procurement', { exact: true })).toBeVisible();

    // 3. Click Create Order
    await page.getByRole('button', { name: /Create Order/i }).first().click();

    // 4. Verify Create Purchase Order page loads (components/procurement/po-order-form-fields.tsx)
    await expect(page.getByText('Create Purchase Order', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    // Both fields render twice — once in the desktop panel, once in the
    // off-screen mobile create-order view — so match the visible instance.
    await expect(page.locator('text="Select Vendor" >> visible=true').first()).toBeVisible();
    await expect(page.locator('text="Add Items to Order" >> visible=true').first()).toBeVisible();
    await page.waitForTimeout(1000); // Wait for animations to settle

    // 5. Test Quick Add Product flow trigger
    // Type a product name that doesn't exist (components/procurement/po-add-item-form.tsx)
    const comboboxInput = page.locator('input[placeholder="e.g. Amoxicillin 500mg"] >> visible=true').first();
    await comboboxInput.evaluate((node: HTMLInputElement) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(node, 'Paracetamol 500mg (Test)');
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Wait a short moment for state to update
    await page.waitForTimeout(500);

    // Click Add (also duplicated between the desktop/mobile create-order views)
    await page.getByRole('button', { name: 'Add', exact: true }).and(page.locator(':visible')).first().click();

    // The Quick Add modal should open (Add New Product) with the typed name
    // pre-filled as the Product Name — first textbox in the dialog.
    await expect(page.locator('text="Add New Product" >> visible=true').first()).toBeVisible();
    const addProductDialog = page.getByRole('dialog').filter({ has: page.getByText('Add New Product') });
    await expect(addProductDialog.getByRole('textbox').first()).toHaveValue('Paracetamol 500mg (Test)');
  });
});
