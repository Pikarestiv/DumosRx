import type { Locator, Page } from '@playwright/test';
import { test, expect, login } from './fixtures';
import { getMigratedFixture, seedLocalDb, storeIdOf } from './local-db';
import { stockedProduct } from './services-seed';

const KEYBOARD_HEIGHT = 300;
const LONG_NAME = 'Amoxicillin 500mg Capsules';
const NO_OVERFLOW_ROUTES = [
  '/dashboard', '/pos', '/inventory/overview', '/inventory/catalog', '/inventory/audits', '/procurement',
  '/procurement/new', '/procurement/vendors', '/customers', '/expenses', '/reports', '/settings/staff',
];

test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

async function seedPaidLogin(page: Page, browser: Parameters<typeof getMigratedFixture>[0], baseURL: string | undefined) {
  const storeId = await storeIdOf(await getMigratedFixture(browser, baseURL));
  await seedLocalDb(page, browser, baseURL, [
    ...stockedProduct(storeId, 'prd-mobile-1', LONG_NAME, 760, 40),
    ...stockedProduct(storeId, 'prd-mobile-2', 'Ibuprofen 400mg', 890, 40),
  ]);
  await login(page);
  await page.evaluate(async () => {
    await window.__e2eSetSubscriptionTier?.('pro');
  });
  await page.reload();
  await expect(page.getByText(/Today's Sales/i).first()).toBeVisible({ timeout: 15000 });
}

async function setKeyboard(page: Page, open: boolean) {
  await page.evaluate(
    ({ open, height }: { open: boolean; height: number }) => {
      const viewport = window.visualViewport;
      if (!viewport) throw new Error('Expected window.visualViewport');
      if (open) Object.defineProperty(viewport, 'height', { configurable: true, get: () => height });
      else delete (viewport as unknown as Record<string, unknown>).height;
      viewport.dispatchEvent(new Event('resize'));
    },
    { open, height: KEYBOARD_HEIGHT },
  );
  const root = page.locator('html');
  if (open) await expect(root).toHaveAttribute('data-keyboard-open', '');
  else await expect(root).not.toHaveAttribute('data-keyboard-open');
}

async function expectUsableAboveKeyboard(page: Page, field: Locator) {
  await field.scrollIntoViewIfNeeded();
  await setKeyboard(page, true);
  await field.focus();
  await page.waitForTimeout(700);
  const placement = await field.evaluate((el, keyboardTop) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, Math.min(Math.max(rect.top + rect.height / 2, 1), keyboardTop - 1));
    return { top: rect.top, bottom: rect.bottom, reachable: hit === el || el.contains(hit) || !!hit?.contains(el) };
  }, KEYBOARD_HEIGHT);
  expect(placement.top).toBeGreaterThanOrEqual(0);
  expect(placement.bottom).toBeLessThanOrEqual(KEYBOARD_HEIGHT);
  expect(placement.reachable).toBe(true);
  await setKeyboard(page, false);
}

test.describe('Mobile layout and ergonomics', () => {
  test.setTimeout(180000);

  test.beforeEach(async ({ page, browser, baseURL }) => {
    await seedPaidLogin(page, browser, baseURL);
  });

  test('no page scrolls sideways at 375px', async ({ page }) => {
    for (const route of NO_OVERFLOW_ROUTES) {
      await page.goto(route);
      await page.waitForTimeout(1200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows horizontally`).toBeLessThanOrEqual(0);
    }
  });

  test('the catalog shows a long product name in full by wrapping it', async ({ page }) => {
    await page.goto('/inventory/catalog');
    const name = page.locator('[data-catalog-row-mobile]').getByText(new RegExp(LONG_NAME, 'i')).first();
    await expect(name).toBeVisible();
    const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1);
    expect(clipped).toBe(false);
  });

  test('primary buttons are at least 40px tall on a touch screen', async ({ page }) => {
    await page.goto('/inventory/catalog');
    const box = await page.getByRole('button', { name: /^Add Product/i }).first().boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height).toBeGreaterThanOrEqual(40);
  });

  test('the POS search stays above the keyboard', async ({ page }) => {
    await page.goto('/pos');
    await expectUsableAboveKeyboard(page, page.locator('#pos-mobile-search-input'));
  });

  test('the Add Product name field stays above the keyboard and the dialog keeps one action', async ({ page }) => {
    await page.goto('/inventory/catalog');
    await page.getByRole('button', { name: /^Add Product/i }).first().click();
    const name = page.getByPlaceholder(/Panadol Extra/i);
    await expectUsableAboveKeyboard(page, name);
    await name.focus();
    await setKeyboard(page, true);
    await expect(page.getByRole('button', { name: /Save & Add Another/i })).toBeHidden();
    await expect(page.getByRole('button', { name: /^Add Product$/i }).last()).toBeVisible();
  });

  test('the PO item search stays above the keyboard with the vendor card out of the way', async ({ page }) => {
    await page.goto('/procurement/new');
    const search = page.getByPlaceholder('Search item by name, SKU or barcode').locator('visible=true').first();
    await expectUsableAboveKeyboard(page, search);
    await search.focus();
    await setKeyboard(page, true);
    await expect(page.getByRole('button', { name: 'Edit order details' })).toBeHidden();
  });
});
