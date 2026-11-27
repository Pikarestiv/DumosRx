import { test, expect, login } from './fixtures';

test.describe('Customers Module', () => {
  test('should log in, navigate to customers, and add a customer', async ({ page }) => {
    await login(page);

    await page.locator('a[href="/customers"]').first().click();
    await expect(page.getByText('Customer Management', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Add Customer/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const firstName = `Playwright${Date.now()}`;
    await page.getByPlaceholder('Jane', { exact: true }).fill(firstName);
    await page.getByPlaceholder('Doe', { exact: true }).fill('TestCustomer');
    await page.getByRole('button', { name: /Save Customer/i }).click();

    await expect(page.getByText(/Customer added successfully/i)).toBeVisible();
  });

  test('creating a customer from Overview auto-switches to Directory and selects it', async ({ page }) => {
    await login(page);
    await page.goto('/customers');

    // Overview is the default tab; confirm we start there, not on Directory.
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');

    await page.getByRole('button', { name: /Add Customer/i }).click();
    const firstName = `AutoNav${Date.now()}`;
    await page.getByPlaceholder('Jane', { exact: true }).fill(firstName);
    await page.getByPlaceholder('Doe', { exact: true }).fill('Redirect');
    await page.getByRole('button', { name: /Save Customer/i }).click();

    // Should have switched to Directory, with the new customer selected
    // (lib/hooks/use-customer-management.ts's handleAddCustomer).
    // Occasionally races with the background query-cache invalidation the
    // insert triggers, so poll the URL first and give the tab re-render a
    // moment to settle before asserting its data-state.
    await expect(page).toHaveURL(/tab=directory/);
    const detailDialog = page.getByRole('dialog', { name: 'Details' });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText(`${firstName} Redirect`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detailDialog).not.toBeVisible();
    await expect(page.getByRole('tab', { name: 'Directory' })).toHaveAttribute('data-state', 'active');
    await expect(page.locator(`text="${firstName} Redirect" >> visible=true`).first()).toBeVisible();
  });
});
