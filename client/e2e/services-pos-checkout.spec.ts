import { test, expect } from './fixtures';
import { queryLocalDb } from './local-db';
import { service, stockedProduct } from './services-seed';
import {
  addProductToCart,
  addServiceToCart,
  cartLine,
  closeReceipt,
  openLatestSaleDetails,
  payCash,
  returnServiceLine,
  seedAndLogin,
} from './services-pos-ui';

const SERVICE = 'E2E Consultation';
const PRODUCT = 'E2E Paracetamol';

test.describe('POS services: mixed checkout and service returns', () => {
  test.setTimeout(120000);

  test('a mixed cart sells the service without touching stock and lists it in the sale', async ({ page, browser, baseURL }) => {
    await seedAndLogin(page, browser, baseURL, (storeId) => [
      service(storeId, 'srv-consult', SERVICE, 2500),
      ...stockedProduct(storeId, 'prd-para', PRODUCT, 500, 10),
    ]);
    await page.goto('/pos');
    await addServiceToCart(page, SERVICE);
    await addProductToCart(page, PRODUCT);
    await expect(cartLine(page, PRODUCT)).toBeVisible();
    await expect(cartLine(page, SERVICE).getByText('Service', { exact: true })).toBeVisible();

    const receipt = await payCash(page);
    await expect(receipt.getByText(/E2E Consultation/i)).toBeVisible();
    await expect(receipt.getByText('₦3,000').first()).toBeVisible();
    await closeReceipt(page);

    const details = await openLatestSaleDetails(page);
    const serviceRow = details.getByRole('row').filter({ hasText: /E2E Consultation/i });
    await expect(serviceRow.getByText('Service', { exact: true })).toBeVisible();
    await expect(serviceRow.getByText('₦2,500').first()).toBeVisible();
    await expect(details.getByRole('row').filter({ hasText: /E2E Paracetamol/i })).toBeVisible();

    const [sale] = await queryLocalDb<{ id: string; total_amount: number }>(page, 'SELECT id, total_amount FROM sales');
    expect(sale.total_amount).toBe(3000);
    expect(
      await queryLocalDb(page, 'SELECT service_id, quantity, unit_price FROM sale_services WHERE sale_id = ?', [sale.id]),
    ).toEqual([{ service_id: 'srv-consult', quantity: 1, unit_price: 2500 }]);
    expect(
      await queryLocalDb(page, 'SELECT product_id, quantity FROM stock_movements WHERE reference_id = ?', [sale.id]),
    ).toEqual([{ product_id: 'prd-para', quantity: -1 }]);
    expect(await queryLocalDb(page, 'SELECT quantity FROM stock_batches')).toEqual([{ quantity: 9 }]);
    expect(await queryLocalDb(page, "SELECT id FROM sale_items WHERE product_id = 'srv-consult'")).toEqual([]);
  });

  test('the checkout receipt flags the service line as (Service)', async ({ page, browser, baseURL }) => {
    test.fail(true, 'A-366: buildReceiptTransaction() passes raw cart lines, so the post-checkout receipt omits "(Service)"');
    await seedAndLogin(page, browser, baseURL, (storeId) => [service(storeId, 'srv-consult', SERVICE, 2500)]);
    await page.goto('/pos');
    await addServiceToCart(page, SERVICE);
    const receipt = await payCash(page);
    await expect(receipt.getByText(/E2E Consultation \(Service\)/i)).toBeVisible({ timeout: 3000 });
  });

  test('returning a quantity-2 service one unit at a time ends the sale fully refunded', async ({ page, browser, baseURL }) => {
    await seedAndLogin(page, browser, baseURL, (storeId) => [service(storeId, 'srv-consult', SERVICE, 2500)]);
    await page.goto('/pos');
    await addServiceToCart(page, SERVICE);
    await cartLine(page, SERVICE).getByRole('button', { name: 'Increase quantity' }).click();
    await expect(cartLine(page, SERVICE).getByRole('spinbutton')).toHaveValue('2');
    await payCash(page);
    await closeReceipt(page);

    await returnServiceLine(page, SERVICE, 1);
    await expect.poll(() => queryLocalDb(page, 'SELECT payment_status FROM sales')).toEqual([
      { payment_status: 'partially_refunded' },
    ]);
    await page.keyboard.press('Escape');
    await expect(page.getByText('Partially refunded', { exact: true })).toBeVisible();

    await returnServiceLine(page, SERVICE, 1);
    await expect.poll(() => queryLocalDb(page, 'SELECT payment_status FROM sales')).toEqual([
      { payment_status: 'refunded' },
    ]);
    expect(await queryLocalDb(page, 'SELECT SUM(quantity) AS returned FROM return_services')).toEqual([{ returned: 2 }]);
    await page.keyboard.press('Escape');
    await expect(page.getByText('Refunded', { exact: true })).toBeVisible();
  });

  test('a services-only sale returned in full is refunded', async ({ page, browser, baseURL }) => {
    await seedAndLogin(page, browser, baseURL, (storeId) => [service(storeId, 'srv-consult', SERVICE, 2500)]);
    await page.goto('/pos');
    await addServiceToCart(page, SERVICE);
    await payCash(page);
    await closeReceipt(page);

    await returnServiceLine(page, SERVICE, 1);
    await expect.poll(() => queryLocalDb(page, 'SELECT payment_status FROM sales')).toEqual([
      { payment_status: 'refunded' },
    ]);
    expect(await queryLocalDb(page, 'SELECT COUNT(*) AS n FROM stock_movements')).toEqual([{ n: 0 }]);
    await page.keyboard.press('Escape');
    await expect(page.getByText('Refunded', { exact: true })).toBeVisible();
  });
});
