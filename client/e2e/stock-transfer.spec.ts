import { test, expect, login } from './fixtures';
import initSqlJs from 'sql.js';

test.describe('Stock transfer entry point and multi-store lifecycle', () => {
  test.setTimeout(120000);

  test('Transfer Stock button is hidden for a single-store account', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/ledger');

    await expect(page.getByText('Immutable log', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Transfer Stock/i })).toHaveCount(0);
  });

  test('Transfer Stock button is visible and opens transfer dialog for a multi-store account', async ({ page }) => {
    await login(page);

    const rawBinary = await page.evaluate(() => {
      const bin = window.getDatabaseBinary?.();
      return bin ? Array.from(bin) : null;
    });

    if (!rawBinary) {
      throw new Error('Failed to retrieve database binary from window');
    }

    const SQL = await initSqlJs();
    const db = new SQL.Database(new Uint8Array(rawBinary));

    db.run(
      "INSERT INTO stores (id, name, slug, subscription_tier, is_initialized, _synced, _deleted) VALUES ('store-branch-2', 'Branch Two', 'branch-two', 'pro', 1, 1, 0)",
    );
    db.run("UPDATE stores SET subscription_tier = 'pro'");

    const storeRow = db.exec("SELECT id FROM stores WHERE id != 'store-branch-2' LIMIT 1");
    const sourceStoreId = storeRow[0]?.values[0]?.[0] as string;

    db.run(
      "INSERT OR REPLACE INTO products (id, name, store_id, selling_price, is_active, _synced, _deleted) VALUES ('prod-transfer-1', 'Paracetamol 500mg', ?, 100, 1, 1, 0)",
      [sourceStoreId],
    );
    db.run(
      "INSERT OR REPLACE INTO stock_batches (id, product_id, store_id, quantity, cost_price, is_active, _synced, _deleted) VALUES ('batch-transfer-1', 'prod-transfer-1', ?, 50, 40, 1, 1, 0)",
      [sourceStoreId],
    );

    const rewritten = Array.from(db.export());
    db.close();

    await page.evaluate(async (data) => {
      await window.restoreDatabase?.(new Uint8Array(data));
    }, rewritten);

    await page.reload();
    await page.goto('/inventory/ledger');
    await expect(page.getByText('Immutable log', { exact: false })).toBeVisible();

    const transferButton = page.getByRole('button', { name: /Transfer Stock/i });
    await expect(transferButton).toBeVisible();
    await transferButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Transfer Stock')).toBeVisible();
    await expect(dialog.getByText(/Select Destination Store/i)).toBeVisible();
  });
});
