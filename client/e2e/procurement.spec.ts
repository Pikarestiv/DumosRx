import { test, expect } from './fixtures';

test.describe('Procurement Module', () => {
  test('should log in, navigate to procurement, and open create order flow', async ({ page }) => {
    test.setTimeout(60000);
    // 1. Log in
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('dumos_client_tour_completed', 'true');
    });
    await page.getByPlaceholder(/admin|username/i).first().fill('admin');
    await page.getByPlaceholder(/••••|password|pin/i).first().fill('1234');
    await page.getByRole('button', { name: /Authorize Entry|sign in/i }).first().click();
    
    await expect(page.getByRole('heading', { name: /Overview/i })).toBeVisible({ timeout: 10000 });
    
    // 2. Navigate to procurement via sidebar
    await page.locator('a[href="/procurement"]').first().click();
    await expect(page.getByText('Procurement', { exact: true }).first()).toBeVisible();
    
    // 3. Click Create Order
    await page.getByRole('button', { name: /Create Order/i }).first().click();
    
    // 4. Verify Create Purchase Order page loads
    await expect(page.getByText('Create Purchase Order', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Order Details').first()).toBeVisible();
    await expect(page.getByText('Add Items to Order').first()).toBeVisible();
    await page.waitForTimeout(1000); // Wait for animations to settle

    // 5. Test Quick Add Product flow trigger
    // Type a product name that doesn't exist
    const comboboxInput = page.getByPlaceholder(/Search product.../i);
    await comboboxInput.evaluate((node: HTMLInputElement) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(node, 'Paracetamol 500mg (Test)');
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Wait a short moment for state to update
    await page.waitForTimeout(500);
    
    // Click Add
    await page.getByRole('button', { name: /Add/i, exact: true }).click();
    
    // The Quick Add modal should open (Add New Product)
    await expect(page.getByText('Add New Product', { exact: true }).first()).toBeVisible();
    // Verify the typed name is pre-filled in the modal
    await expect(page.getByLabel(/Product Name/i).first()).toHaveValue('Paracetamol 500mg (Test)');
  });
});
