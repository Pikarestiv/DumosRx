import { test, expect, loginAsPaidTier } from './fixtures';

const shot = (name: string) => ({ path: test.info().outputPath(name) });

test.describe('Staff Recovery and Sell-at-Zero Browser Smoke Tests', () => {
  test.setTimeout(120000);

  test('staff: create account, soft delete, verify in deleted tab, recover, and reactivate', async ({ page }) => {
    await loginAsPaidTier(page);

    await page.goto('/settings/staff');
    await expect(page.getByRole('heading', { name: 'Staff Management' })).toBeVisible();

    const deletedTab = page.getByRole('tab', { name: /Deleted Accounts/i });
    await expect(deletedTab).toBeVisible();
    await deletedTab.click();
    await expect(page.getByPlaceholder('Search deleted staff...')).toBeVisible();
    await page.screenshot(shot('smoke-staff-deleted-tab-initial.png'));

    await page.getByRole('tab', { name: /Staff Roster/i }).click();

    const uniqueId = Date.now();
    const username = `smoke_${uniqueId}`;

    await page.getByRole('button', { name: /^Add$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('First Name *').fill('Smoke');
    await dialog.getByLabel('Last Name *').fill(`Tester${uniqueId}`);
    await dialog.getByLabel('Username *').fill(username);
    await dialog.locator('input[data-input-otp="true"]').first().fill('5678');
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Sales Staff', exact: true }).click();

    await dialog.getByRole('button', { name: /^Create Account$/i }).click();
    await expect(dialog).not.toBeVisible();

    const userRow = page.locator('tr', { hasText: username });
    await expect(userRow).toBeVisible();
    await page.screenshot(shot('smoke-staff-created.png'));

    await userRow.getByRole('button', { name: `Delete ${username}` }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByText('Delete Staff Account')).toBeVisible();
    await page.screenshot(shot('smoke-staff-delete-dialog.png'));

    await deleteDialog.getByRole('button', { name: /^Delete Account$/i }).click();
    await expect(deleteDialog).not.toBeVisible();
    await expect(userRow).not.toBeVisible();

    await deletedTab.click();
    const deletedRow = page.locator('tr', { hasText: username });
    await expect(deletedRow).toBeVisible();
    await expect(deletedRow.getByText('Deleted')).toBeVisible();
    await page.screenshot(shot('smoke-staff-in-deleted-tab.png'));

    await deletedRow.getByRole('button', { name: /Recover Account/i }).click();
    await expect(deletedRow).not.toBeVisible();

    await page.getByRole('tab', { name: /Staff Roster/i }).click();
    await expect(userRow).toBeVisible();
    await expect(userRow.getByText('Inactive')).toBeVisible();

    await userRow.getByRole('button', { name: `Reactivate ${username}` }).click();
    await expect(userRow.getByText('Active')).toBeVisible();
    await page.screenshot(shot('smoke-staff-recovered-and-active.png'));
  });

  test('register configs: verify and enable sell beyond recorded stock', async ({ page }) => {
    await loginAsPaidTier(page);

    await page.goto('/settings/register-configs');
    const toggle = page.locator('button#allow-sale-without-stock');
    await expect(toggle).toBeVisible();

    const isChecked = await toggle.getAttribute('aria-checked');
    if (isChecked !== 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }

    await page.screenshot(shot('smoke-register-config-sell-at-zero.png'));
  });

  test('pos: add 0-stock product to cart and verify backorder warning and checkout flow', async ({ page }) => {
    await loginAsPaidTier(page);

    await page.goto('/settings/register-configs');
    const toggle = page.locator('button#allow-sale-without-stock');
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-checked')) !== 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }

    const zeroProductName = `ZeroStock Med ${Date.now()}`;
    await page.goto('/inventory/catalog');
    await page.getByRole('button', { name: /Add Product/i }).click();
    const prodDialog = page.getByRole('dialog');
    await prodDialog.getByRole('combobox').first().fill(zeroProductName);
    await page.getByLabel(/Selling Price/i).first().fill('1500');
    await page.getByLabel(/Reorder Level/i).first().fill('5');
    await page.getByRole('button', { name: /^Add Product$/i }).last().click();
    await expect(page.getByText('Add New Product', { exact: true })).not.toBeVisible();

    await page.goto('/pos');
    await page.getByPlaceholder(/Search products/i).first().fill(zeroProductName);
    const card = page.getByRole('button', { name: new RegExp(zeroProductName, 'i') }).first();
    await expect(card).toBeVisible();
    await card.click();

    await expect(page.getByRole('button', { name: /Charge/i })).toBeVisible();
    await page.screenshot(shot('smoke-pos-sell-zero-added.png'));

    const qtyStepper = page.locator('.rounded-lg.overflow-hidden.shrink-0');
    if (await qtyStepper.isVisible()) {
      await qtyStepper.getByRole('button').last().click();
    }
    await page.screenshot(shot('smoke-pos-cart-backorder-stepper.png'));

    const chargeBtn = page.getByRole('button', { name: /Charge/i });
    await expect(chargeBtn).toBeVisible();
    await chargeBtn.click();

    const paymentDialog = page.getByRole('dialog');
    await expect(paymentDialog).toBeVisible();
    await expect(paymentDialog.getByText(/Payment/i).first()).toBeVisible();
    await page.screenshot(shot('smoke-pos-checkout-ready.png'));
  });
});

