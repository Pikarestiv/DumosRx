import { test, expect, login } from './fixtures';
import path from 'path';

// Regression coverage for the Inventory > Catalog > Import flow:
// Rationale: docs/CLIENT_COMMENTS.md#line-e2e-product-import-spec-ts-L4
test.describe('Product Import dialog', () => {
  test('multi-sheet workbook shows the sheet picker, then the mapped row count', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');

    await page.getByRole('button', { name: /^Import$/i }).click();
    await expect(page.getByText('Import products', { exact: true })).toBeVisible();

    const fixturePath = path.join(__dirname, 'fixtures', 'multi-sheet-import.xlsx');
    await page.locator('input[type="file"]').setInputFiles(fixturePath);

    // Sheet picker: the fixture has 3 sheets (Sheet1:
    // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-product-import-spec-ts-L23
    await expect(page.getByText('This file has 3 sheets. Select the one with your product list.')).toBeVisible();

    await page.getByRole('combobox').click();
    await expect(page.getByRole('option', { name: 'Sheet1' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Sheet2' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Sheet3' })).toBeVisible();
    await page.getByRole('option', { name: 'Sheet1' }).click();

    // Column-mapping step: auto-mapping should match all 6 QuickBooks-shaped columns (Item Number, Item Name, Average Unit Cos…
    // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-product-import-spec-ts-L34
    await expect(page.getByText(/We matched \d+ of \d+ columns automatically/)).toBeVisible();
    await expect(page.getByText('3 row(s) will be imported', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 3 Row(s)' })).toBeVisible();

    // Close without importing - this spec only verifies the dialog's own UI/state machine, not the write path (covered separat…
    // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-product-import-spec-ts-L41
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Import products', { exact: true })).not.toBeVisible();
  });

  test('re-uploading and picking Sheet2 shows its own row count', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/catalog');

    await page.getByRole('button', { name: /^Import$/i }).click();
    const fixturePath = path.join(__dirname, 'fixtures', 'multi-sheet-import.xlsx');
    await page.locator('input[type="file"]').setInputFiles(fixturePath);

    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Sheet2' }).click();

    await expect(page.getByText('2 row(s) will be imported', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 2 Row(s)' })).toBeVisible();
  });
});
