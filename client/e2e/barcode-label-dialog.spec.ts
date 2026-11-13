import path from 'path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import type { SeedStatement } from './local-db';
import { nameMatcher, seedAndLogin } from './services-pos-ui';

const SCREENSHOT_DIR =
  process.env.E2E_SCREENSHOT_DIR ?? path.join(__dirname, '..', 'test-results', 'barcode-label-dialog');
const LONG_NAME = 'e2e paracetamol extra strength caplets with caffeine and vitamin c family pack';

const PRODUCTS = [
  { id: 'prd-ean', name: `${LONG_NAME} ean`, barcode: '5901234123457' },
  { id: 'prd-custom', name: `${LONG_NAME} custom`, barcode: 'DRX-CUSTOM-LABEL-0001234' },
  { id: '3f2b8c1e-9d4a-4e7b-a1c2-5d6e7f8a9b0c', name: `${LONG_NAME} uuid`, barcode: null },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'laptop', width: 1280, height: 600 },
  { name: 'phone', width: 390, height: 844 },
];

const seed = (storeId: string): SeedStatement[] =>
  PRODUCTS.map((p) => [
    `INSERT INTO products (id, name, barcode, selling_price, reorder_level, is_active, store_id, created_at, updated_at)
     VALUES (?, ?, ?, 1250, 2, 1, ?, datetime('now'), datetime('now'))`,
    [p.id, p.name, p.barcode, storeId],
  ]);

async function openLabelDialog(page: Page, productName: string) {
  await page.getByPlaceholder(/search/i).filter({ visible: true }).first().fill(productName);
  const row = page.locator('[data-catalog-row-desktop], [data-catalog-row-mobile]').filter({ visible: true })
    .filter({ hasText: nameMatcher(productName) }).first();
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Print barcode label/i }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Print Barcode Labels' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(dialog).toHaveCSS('opacity', '1');
  return dialog;
}

async function expectContained(dialog: Locator, viewportWidth: number, annotation: string) {
  const overflow = await dialog.evaluate((el) => {
    const sideScrollers = [el, ...Array.from(el.querySelectorAll('*'))].filter((n) => {
      const overflowX = getComputedStyle(n).overflowX;
      return n.scrollWidth > n.clientWidth + 1 && overflowX !== 'hidden' && overflowX !== 'visible' && overflowX !== 'clip';
    });
    return {
      dialog: el.scrollWidth - el.clientWidth,
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sideScrollers: sideScrollers.length,
      right: el.getBoundingClientRect().right,
    };
  });
  test.info().annotations.push({ type: annotation, description: JSON.stringify(overflow) });
  expect(overflow.dialog).toBeLessThanOrEqual(0);
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.sideScrollers).toBe(0);
  expect(overflow.right).toBeLessThanOrEqual(viewportWidth);
  for (const name of [/^Cancel$/, /^Print \d+ labels?$/]) {
    await expect(dialog.getByRole('button', { name })).toBeInViewport({ ratio: 1 });
  }
}

test.describe('Print Barcode Labels dialog layout', () => {
  test.setTimeout(180000);

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} ${viewport.width}x${viewport.height}: never scrolls sideways and keeps Cancel and Print on screen`, async ({
      page,
      browser,
      baseURL,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await seedAndLogin(page, browser, baseURL, seed);
      await page.goto('/inventory/catalog');

      for (const product of PRODUCTS) {
        const dialog = await openLabelDialog(page, product.name);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${viewport.name}-${viewport.width}x${viewport.height}-${product.id.slice(0, 10)}.png`),
        });

        await expectContained(dialog, viewport.width, `${viewport.name} ${product.id}`);
        await dialog.getByRole('button', { name: /A4 sheet/ }).click();
        await expectContained(dialog, viewport.width, `${viewport.name} ${product.id} a4`);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${viewport.name}-${viewport.width}x${viewport.height}-${product.id.slice(0, 10)}-a4.png`),
        });
        await dialog.getByRole('button', { name: /Label roll/ }).click();
        await dialog.getByRole('button', { name: /^Cancel$/ }).click();
        await expect(dialog).toBeHidden();
      }
    });
  }
});
