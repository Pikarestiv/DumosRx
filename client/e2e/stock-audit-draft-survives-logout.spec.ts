import { test, expect, login } from './fixtures';
import type { Page } from '@playwright/test';
import { seedAndLogin } from './services-pos-ui';
import { stockedProduct } from './services-seed';

async function openCycleCount(page: Page) {
  await page.goto('/inventory/overview');
  await page.getByRole('button', { name: /Start Audit/i }).click();
  await expect(page.getByText('Cycle Count', { exact: true })).toBeVisible();
}

test.describe('Cycle Count draft durability', () => {
  test('a counted row is still counted after logging out and back in', async ({ page, browser, baseURL }) => {
    await seedAndLogin(page, browser, baseURL, (storeId) => [
      ...stockedProduct(storeId, 'e2e-audit-amoxil', 'E2E Amoxil 500mg', 900, 12),
      ...stockedProduct(storeId, 'e2e-audit-flagyl', 'E2E Flagyl 200mg', 400, 5),
    ]);
    await openCycleCount(page);

    const label = 'Mark E2E Amoxil 500mg as counted';
    await page.getByRole('checkbox', { name: label }).click({ timeout: 15000 });
    await expect(page.getByRole('checkbox', { name: label })).toBeChecked();

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const leave = page.getByRole('button', { name: /Leave count/i });
    if (await leave.isVisible()) await leave.click();

    await page.getByRole('button', { name: /Test Admin/ }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Log out completely' }).click();
    const warning = page.getByRole('dialog');
    await expect(warning).toContainText('A cycle count is in progress');
    await expect(warning).toContainText('saved on this device');
    await warning.getByRole('button', { name: /^Sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    await login(page);
    await openCycleCount(page);

    await expect(page.getByRole('checkbox', { name: label })).toBeChecked({ timeout: 15000 });
  });
});
