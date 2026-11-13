import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { queryLocalDb } from './local-db';
import { service, stockedProduct } from './services-seed';
import { addProductToCart, addServiceToCart, cartLine, seedAndLogin } from './services-pos-ui';

const SERVICE = 'E2E Massage';
const PRODUCT = 'E2E Vitamin C';
const REPRICED_NOTICE = /Catalog prices have changed for some services/i;

async function holdCart(page: Page) {
  await page.getByRole('button', { name: /Hold Sale/i }).click();
  await expect(page.getByText('Transaction held successfully')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Cart is empty')).toBeVisible();
}

async function recallOnlyHeldSale(page: Page) {
  await page.getByRole('button', { name: 'Held transactions' }).click();
  const heldDialog = page.getByRole('dialog', { name: /Held Transactions/i });
  await heldDialog.getByRole('button', { name: /Recall/i }).click();
  await expect(page.getByText('Transaction recalled')).toBeVisible({ timeout: 10000 });
}

async function setCatalogPrice(page: Page, price: string) {
  await page.goto('/inventory/services');
  await page.getByRole('button', { name: `Edit ${SERVICE}` }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Edit Service' });
  await dialog.getByLabel(/Price/).fill(price);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: `₦${Number(price).toLocaleString('en-NG')}` })).toBeVisible();
}

async function holdMixedCart(page: Page) {
  await page.goto('/pos');
  await addServiceToCart(page, SERVICE);
  await addProductToCart(page, PRODUCT);
  await expect(cartLine(page, PRODUCT)).toBeVisible();
  await holdCart(page);
}

test.describe('POS services: held carts', () => {
  test.setTimeout(120000);

  const seed = (storeId: string) => [
    service(storeId, 'srv-massage', SERVICE, 2500),
    ...stockedProduct(storeId, 'prd-vitc', PRODUCT, 800, 10),
  ];

  test('recall after a catalog price change keeps the held price and shows the repricing notice', async ({
    page,
    browser,
    baseURL,
  }) => {
    await seedAndLogin(page, browser, baseURL, seed);
    await holdMixedCart(page);
    await setCatalogPrice(page, '3000');

    await page.goto('/pos');
    await recallOnlyHeldSale(page);
    await expect(page.getByText(REPRICED_NOTICE)).toBeVisible();
    await expect(cartLine(page, SERVICE).getByText('₦2,500 each')).toBeVisible();
    await expect(cartLine(page, PRODUCT)).toBeVisible();
    expect(await queryLocalDb(page, 'SELECT id FROM held_transactions WHERE _deleted = 0')).toEqual([]);
  });

  test('recall with an unchanged catalog restores the service without a repricing notice', async ({
    page,
    browser,
    baseURL,
  }) => {
    await seedAndLogin(page, browser, baseURL, seed);
    await holdMixedCart(page);

    await page.reload();
    await recallOnlyHeldSale(page);
    await expect(cartLine(page, SERVICE).getByText('₦2,500 each')).toBeVisible();
    await expect(cartLine(page, PRODUCT)).toBeVisible();
    await expect(page.getByText(REPRICED_NOTICE)).toHaveCount(0);
  });

  test('a manual price override on a held service line does not raise a false repricing notice', async ({
    page,
    browser,
    baseURL,
  }) => {
    await seedAndLogin(page, browser, baseURL, (storeId) => [
      ...seed(storeId),
      ['UPDATE stores SET markup_sales_enabled = 1 WHERE id = ?', [storeId]],
    ]);
    await page.goto('/pos');
    await addServiceToCart(page, SERVICE);
    await page.getByText('Reseller sale').locator('..').getByRole('switch').click();
    await page.getByRole('button', { name: 'Store Markup' }).click();
    const priceInput = cartLine(page, SERVICE).getByRole('spinbutton', { name: 'Override unit price' });
    await priceInput.fill('3200');
    await priceInput.press('Enter');
    await expect(cartLine(page, SERVICE).getByText('₦3,200').first()).toBeVisible();
    await holdCart(page);

    const [held] = await queryLocalDb<{ items_json: string }>(page, 'SELECT items_json FROM held_transactions');
    expect(JSON.parse(held.items_json)).toEqual([
      expect.objectContaining({ item_type: 'service', unit_price: 3200, original_unit_price: 2500 }),
    ]);

    await page.reload();
    await recallOnlyHeldSale(page);
    await expect(cartLine(page, SERVICE).getByRole('spinbutton', { name: 'Override unit price' })).toHaveValue('3200');
    await expect(page.getByText(REPRICED_NOTICE)).toHaveCount(0);
  });
});
