import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import type { Locator, Page } from '@playwright/test';
import { test, expect, login, writeLocalDbBinary } from './fixtures';

const WIDTHS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const LONGEST_LABEL = 'Hardware & Building Materials';
const SHOTS = process.env.STORE_TYPE_SHOTS_DIR;

async function shoot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('expected a rendered element');
  return box;
}

async function expectFitsInside(option: Locator, container: Locator) {
  const [box, bounds] = await Promise.all([boxOf(option), boxOf(container)]);
  expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  const clipped = await option.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
}

async function uninitialisedFixture(): Promise<number[]> {
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  const db = new SQL.Database(fs.readFileSync(path.join(__dirname, '.auth', 'test-db.bin')));
  db.run('UPDATE stores SET is_initialized = 0');
  return Array.from(db.export());
}

for (const size of WIDTHS) {
  test.describe(`store type pickers at ${size.width}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('register step select lists every type without overflowing', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('button', { name: 'Create account' }).click();
      const select = page.getByLabel('Store Type');
      await expect(select.locator('option')).toHaveCount(12);
      await select.selectOption('hardware');
      await expectNoHorizontalOverflow(page);
      const selectBox = await boxOf(select);
      expect(selectBox.x + selectBox.width).toBeLessThanOrEqual(size.width);
      await select.scrollIntoViewIfNeeded();
      await shoot(page, `client-register-${size.width}`);
    });

    test('settings business vertical card fits every label and marks the current type', async ({ page }) => {
      await login(page);
      await page.goto('/settings/business-info');
      const card = page.locator('div.grid', { has: page.getByRole('button', { name: LONGEST_LABEL }) });
      await expect(card.getByRole('button')).toHaveCount(12);
      await expect(card.getByRole('button', { name: 'Pharmacy' })).toHaveAttribute('aria-pressed', 'true');
      for (const option of await card.getByRole('button').all()) {
        await expectFitsInside(option, card);
        expect((await boxOf(option)).height).toBeGreaterThanOrEqual(44);
      }
      await expectNoHorizontalOverflow(page);
      await card.scrollIntoViewIfNeeded();
      await shoot(page, `client-settings-vertical-${size.width}`);
    });

    test('fleet dialog select opens with every type inside the viewport', async ({ page }) => {
      await login(page);
      await page.goto('/settings/branches');
      await page.getByRole('button', { name: /Add Store/i }).first().click();
      const trigger = page.getByRole('combobox', { name: 'Store Type' });
      await trigger.click();
      const listbox = page.getByRole('listbox');
      await expect(listbox.getByRole('option')).toHaveCount(12);
      const lastOption = listbox.getByRole('option', { name: 'Other' });
      await lastOption.scrollIntoViewIfNeeded();
      await expect(lastOption).toBeInViewport();
      await expectFitsInside(listbox.getByRole('option', { name: LONGEST_LABEL }), listbox);
      await expectNoHorizontalOverflow(page);
      await shoot(page, `client-fleet-select-${size.width}`);
    });

    test('setup wizard shows every type, scrolls to the last and keeps Next reachable', async ({ page }) => {
      await page.goto('/manifest.json');
      await writeLocalDbBinary(page, await uninitialisedFixture());
      await login(page);
      const dialog = page.getByRole('dialog', { name: /Welcome to/i });
      await expect(dialog).toBeVisible({ timeout: 15000 });
      const grid = dialog.locator('div.grid', { hasText: LONGEST_LABEL });
      const cards = grid.locator(':scope > *');
      await expect(cards).toHaveCount(12);
      for (const option of await cards.all()) await expectFitsInside(option, grid);
      await shoot(page, `client-wizard-top-${size.width}`);
      await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeInViewport();
      const last = grid.getByText('Other', { exact: true });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      await last.click();
      const next = dialog.getByRole('button', { name: 'Next', exact: true });
      await expect(next).toBeInViewport();
      await expectNoHorizontalOverflow(page);
      await shoot(page, `client-wizard-bottom-${size.width}`);
    });
  });
}
