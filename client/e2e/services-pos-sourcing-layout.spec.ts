import path from 'path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { measureLabel } from './layout-metrics';
import type { SeedStatement } from './local-db';
import { allowSaleWithoutStock, stockedProduct } from './services-seed';
import { addProductToCart, cartLine, nameMatcher, seedAndLogin } from './services-pos-ui';

const SCREENSHOT_DIR =
  process.env.E2E_SCREENSHOT_DIR ?? path.join(__dirname, '..', 'test-results', 'pos-sourcing-layout');
const IN_STOCK = 'E2E Amoxicillin 500mg Capsules';
const OUT_OF_STOCK = 'E2E Ciprofloxacin 500mg Tablets';
const MIN_SMALL_TEXT_CONTRAST = 4.5;
const THEMES = ['light', 'dark'] as const;

test.use({ viewport: { width: 390, height: 844 } });

const twoProducts = (storeId: string): SeedStatement[] => [
  ...stockedProduct(storeId, 'prd-amox', IN_STOCK, 1200, 10),
  ...stockedProduct(storeId, 'prd-cipro', OUT_OF_STOCK, 1500, 0),
];

async function openMobileCartAndCapture(page: Page, theme: (typeof THEMES)[number], screenshotName: string) {
  // ThemeProvider only swaps this class; set it directly because a full reload resets a stored dark theme (A-367).
  await page.evaluate((t: string) => document.documentElement.classList.replace(t === 'dark' ? 'light' : 'dark', t), theme);
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
  await page.getByText(/^2 items$/).filter({ visible: true }).first().click();
  const drawer = page.getByRole('dialog', { name: 'Cart' });
  await expect(drawer).toBeVisible();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15000 });
  await drawer.screenshot({ path: path.join(SCREENSHOT_DIR, `${screenshotName}-${theme}.png`) });
  return drawer;
}

async function expectOneLineClearOfStepper(page: Page, productName: string, label: Locator) {
  const metrics = await measureLabel(label);
  const stepperBox = await cartLine(page, productName).getByRole('button', { name: 'Decrease quantity' }).boundingBox();
  test.info().annotations.push({ type: `metrics: ${productName}`, description: JSON.stringify(metrics) });
  expect(metrics.textLines).toBe(1);
  expect(metrics.height).toBeLessThan(metrics.lineHeight * 2);
  expect(metrics.right).toBeLessThanOrEqual(stepperBox?.x ?? 0);
  return metrics;
}

test.describe('POS cart sourcing controls at phone width', () => {
  test.setTimeout(120000);

  for (const theme of THEMES) {
    test(`${theme}: spot-sourced and in-stock lines keep their sourcing labels on one visible line`, async ({
      page,
      browser,
      baseURL,
    }) => {
      await seedAndLogin(page, browser, baseURL, twoProducts);
      await page.goto('/pos');
      await addProductToCart(page, IN_STOCK);
      await addProductToCart(page, OUT_OF_STOCK);
      const spotDialog = page.getByRole('dialog').filter({ hasText: 'Spot Sourcing (External Sourcing)' });
      await spotDialog.getByPlaceholder('0.00').fill('900');
      await spotDialog.getByRole('button', { name: 'Add to Cart as Spot Sourced' }).click();

      const drawer = await openMobileCartAndCapture(page, theme, 'cart-spot-sourced-390');
      const drawerWidth = (await drawer.boundingBox())?.width ?? 0;
      expect(drawerWidth).toBeGreaterThanOrEqual(370);
      expect(drawerWidth).toBeLessThanOrEqual(395);

      const sourceOutside = cartLine(page, IN_STOCK).getByRole('button', { name: 'Source outside' });
      await expect(sourceOutside).toBeVisible();
      const inStock = await expectOneLineClearOfStepper(page, IN_STOCK, sourceOutside);
      expect(inStock.effectiveOpacity).toBe(1);
      expect(inStock.contrast).toBeGreaterThanOrEqual(MIN_SMALL_TEXT_CONTRAST);

      const spotSourced = cartLine(page, OUT_OF_STOCK).getByRole('button', { name: /Spot Sourced/ });
      await expect(spotSourced).toBeVisible();
      await expectOneLineClearOfStepper(page, OUT_OF_STOCK, spotSourced);
      const spotText = await measureLabel(spotSourced.locator('span'));
      test.info().annotations.push({ type: 'metrics: spot-sourced text', description: JSON.stringify(spotText) });
      const line = cartLine(page, IN_STOCK);
      for (const [what, locator] of [
        ['name', line.getByText(nameMatcher(IN_STOCK))],
        ['line total', line.getByText('₦1,200', { exact: true })],
        ['quantity', line.getByRole('spinbutton')],
      ] as const) {
        test.info().annotations.push({ type: `metrics: ${what}`, description: JSON.stringify(await measureLabel(locator)) });
      }
    });

    test(`${theme}: a backordered out-of-stock line keeps the "Source outside" pill on one line`, async ({
      page,
      browser,
      baseURL,
    }) => {
      await seedAndLogin(page, browser, baseURL, (storeId) => [allowSaleWithoutStock(storeId), ...twoProducts(storeId)]);
      await page.goto('/pos');
      await addProductToCart(page, IN_STOCK);
      await addProductToCart(page, OUT_OF_STOCK);

      await openMobileCartAndCapture(page, theme, 'cart-backorder-390');
      const line = cartLine(page, OUT_OF_STOCK);
      await expect(line.getByText('Out of stock', { exact: true })).toBeVisible();
      const pill = line.getByRole('button', { name: 'Source outside' });
      const metrics = await expectOneLineClearOfStepper(page, OUT_OF_STOCK, pill);
      expect(metrics.clipped).toBe(false);
      expect(metrics.contrast).toBeGreaterThanOrEqual(MIN_SMALL_TEXT_CONTRAST);
    });
  }
});
