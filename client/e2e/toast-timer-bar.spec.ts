import { test, expect } from './fixtures';
import { allowSaleWithoutStock, stockedProduct } from './services-seed';
import { addProductToCart, seedAndLogin } from './services-pos-ui';

test('a warning toast shows its depleting timer bar (A-370)', async ({ page, browser, baseURL }) => {
  await seedAndLogin(page, browser, baseURL, (storeId) => [
    allowSaleWithoutStock(storeId),
    ...stockedProduct(storeId, 'prd-toast-bar', 'Toast Bar Item', 1000, 3),
  ]);
  await page.goto('/pos');
  await addProductToCart(page, 'Toast Bar Item');
  const qty = page.locator('[data-cart-item-id] input[type=number]').first();
  await qty.fill('4');
  await qty.press('Enter');

  const toast = page.locator('[data-sonner-toast][data-type="warning"]').last();
  await expect(toast).toContainText('owed');
  const bar = await toast.evaluate((el) => {
    const after = getComputedStyle(el, '::after');
    return { height: after.height, animation: after.animationName };
  });
  expect(bar).toEqual({ height: '5px', animation: 'sonner-deplete' });
});
