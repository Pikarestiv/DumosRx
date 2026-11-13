import path from 'path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { measureLabel } from './layout-metrics';
import type { SeedStatement } from './local-db';
import { stockedProduct } from './services-seed';
import { addProductToCart, seedAndLogin } from './services-pos-ui';

const SCREENSHOT_DIR =
  process.env.E2E_SCREENSHOT_DIR ?? path.join(__dirname, '..', 'test-results', 'pos-cart-space');
const THEMES = ['light', 'dark'] as const;
const PRODUCTS = [
  'E2E Amoxicillin 500mg Capsules',
  'E2E Paracetamol 500mg Tablets',
  'E2E Vitamin C 1000mg Effervescent',
  'E2E Ibuprofen 400mg',
  'E2E Cough Syrup 100ml',
  'E2E Hand Sanitizer 250ml Pump Bottle',
];
const VIEWS = [
  { name: 'phone-390', viewport: { width: 390, height: 844 }, minCapacity: 7 },
  { name: 'desktop-420', viewport: { width: 1280, height: 844 }, minCapacity: 7 },
] as const;

const sixProductsWithResellerToggle = (storeId: string): SeedStatement[] => [
  ['UPDATE stores SET markup_sales_enabled = 1 WHERE id = ?', [storeId]],
  ...PRODUCTS.flatMap((name, i) => stockedProduct(storeId, `prd-space-${i}`, name, 1000 + i * 250, 20)),
];

async function openCart(page: Page, phone: boolean): Promise<Locator> {
  if (!phone) return page.locator('div.lg\\:flex').filter({ has: page.locator('[data-cart-item-id]') }).first();
  await page.getByText(new RegExp(`^${PRODUCTS.length} items$`)).filter({ visible: true }).first().click();
  const drawer = page.getByRole('dialog', { name: 'Cart' });
  await expect(drawer).toBeVisible();
  return drawer;
}

async function measureRows(cart: Locator): Promise<{ visible: number; capacity: number }> {
  return cart.locator('[data-cart-item-id]').first().evaluate((first) => {
    const list = first.parentElement as HTMLElement;
    const bounds = list.getBoundingClientRect();
    const rows = Array.from(list.querySelectorAll('[data-cart-item-id]'));
    const visible = rows.filter((row) => {
      const r = row.getBoundingClientRect();
      return r.top >= bounds.top - 0.5 && r.bottom <= bounds.bottom + 0.5;
    }).length;
    const rowHeight = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) / rows.length;
    return { visible, capacity: Math.round((list.clientHeight / rowHeight) * 10) / 10 };
  });
}

test.describe('POS cart vertical space with a six-line cart', () => {
  test.setTimeout(180000);

  for (const view of VIEWS) {
    for (const theme of THEMES) {
      test(`${view.name} ${theme}: shows the most cart rows it can with Charge still visible`, async ({ page, browser, baseURL }) => {
        await page.setViewportSize(view.viewport);
        await seedAndLogin(page, browser, baseURL, sixProductsWithResellerToggle);
        await page.goto('/pos');
        for (const name of PRODUCTS) await addProductToCart(page, name);
        await page.evaluate((t: string) => document.documentElement.classList.replace(t === 'dark' ? 'light' : 'dark', t), theme);

        const cart = await openCart(page, view.name.startsWith('phone'));
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15000 });
        const rows = await measureRows(cart);
        test.info().annotations.push({ type: 'rows', description: JSON.stringify(rows) });
        await cart.screenshot({ path: path.join(SCREENSHOT_DIR, `${view.name}-${theme}.png`) });

        expect(rows.visible).toBe(PRODUCTS.length);
        expect(rows.capacity).toBeGreaterThanOrEqual(view.minCapacity);
        await expect(cart.getByRole('button', { name: /^Charge/ })).toBeInViewport({ ratio: 1 });
        for (const action of ['Request Item', 'Hold Sale', 'Clear cart', 'Preview Quote']) {
          const metrics = await measureLabel(cart.getByRole('button', { name: action }));
          test.info().annotations.push({ type: `metrics: ${action}`, description: JSON.stringify(metrics) });
          expect(metrics.textLines).toBe(1);
          expect(metrics.clipped).toBe(false);
          expect(metrics.contrast).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});
