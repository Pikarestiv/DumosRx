import { test, expect } from './fixtures';

test.describe('Procurement Module', () => {
  test('should log in, navigate to procurement, and open create order flow', async ({ page }) => {
    // 1. Log in
    await page.goto('/login');
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

    // 5. Test Quick Add Product flow trigger
    // Type a product name that doesn't exist
    const comboboxInput = page.getByPlaceholder(/Search product.../i);
    await comboboxInput.click();
    await comboboxInput.fill('Paracetamol 500mg (Test)');
    
    // Click Add
    await page.getByRole('button', { name: /Add/i, exact: true }).click();
    
    // The Quick Add modal should open (Add New Product)
    await expect(page.getByText('Add New Product', { exact: true }).first()).toBeVisible();
    // Verify the typed name is pre-filled in the modal
    await expect(page.getByLabel(/Product Name/i).first()).toHaveValue('Paracetamol 500mg (Test)');
  });
});
