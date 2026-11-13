import { expect, login } from './fixtures';
import type { Browser, Page } from '@playwright/test';
import { getMigratedFixture, seedLocalDb, storeIdOf, type SeedStatement } from './local-db';

export async function seedAndLogin(
  page: Page,
  browser: Browser,
  baseURL: string | undefined,
  seed: (storeId: string) => SeedStatement[],
  username = 'admin',
): Promise<string> {
  const storeId = await storeIdOf(await getMigratedFixture(browser, baseURL));
  await seedLocalDb(page, browser, baseURL, seed(storeId));
  await login(page, username);
  return storeId;
}

export const nameMatcher = (name: string) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

export function cartLine(page: Page, name: string) {
  return page.locator('[data-cart-item-id]').filter({ visible: true }).filter({ hasText: nameMatcher(name) });
}

export async function addServiceToCart(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Services' }).click();
  await page.getByRole('button', { name: nameMatcher(name) }).first().click();
  await expect(cartLine(page, name)).toBeVisible();
}

export async function addProductToCart(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Products' }).click();
  await page.getByPlaceholder(/Search products/i).filter({ visible: true }).first().fill(name);
  // An out-of-stock card is aria-disabled yet still clickable: it opens the spot-sourcing dialog.
  await page.getByRole('button', { name: nameMatcher(name) }).first().click({ force: true });
}

export async function payCash(page: Page) {
  await page.getByRole('button', { name: /^Charge/i }).click();
  await page.getByRole('button', { name: /Process Payment/i }).click();
  const receipt = page.getByRole('dialog').filter({ hasText: 'Sale Completed' });
  await expect(receipt).toBeVisible({ timeout: 10000 });
  return receipt;
}

export async function closeReceipt(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

export async function openLatestSaleDetails(page: Page) {
  await page.getByRole('tab', { name: 'Recent Sales' }).click();
  await page.getByText(/^Sale #/).first().click();
  const details = page.getByRole('dialog').filter({ hasText: 'Transaction Details' });
  await expect(details).toBeVisible();
  return details;
}

export async function returnServiceLine(page: Page, serviceName: string, quantity: number) {
  const details = await openLatestSaleDetails(page);
  await details.getByRole('button', { name: /Recall \/ Return/i }).click();
  const returnDialog = page.getByRole('dialog').filter({ hasText: 'Process Return & Refund' });
  const row = returnDialog.getByRole('row').filter({ hasText: nameMatcher(serviceName) });
  await row.getByRole('checkbox').check();
  const qty = row.getByRole('cell').nth(3);
  while (Number(await qty.innerText()) > quantity) {
    const before = await qty.innerText();
    await row.getByRole('button').first().click();
    await expect(qty).not.toHaveText(before);
  }
  await expect(qty).toHaveText(String(quantity));
  await returnDialog.getByLabel('Reason for Return').fill('E2E service return');
  await returnDialog.getByRole('button', { name: /Confirm Return & Refund/i }).click();
  await page.getByRole('button', { name: /Yes, Process Return/i }).click();
  await expect(returnDialog).toBeHidden({ timeout: 10000 });
}
