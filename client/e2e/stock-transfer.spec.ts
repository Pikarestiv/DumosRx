import { test, expect, login } from './fixtures';

// Regression coverage for the Inventory > Ledger "Transfer Stock" entry
// point (components/stock-batch/transfer-stock-dialog.tsx). The full
// transfer flow (picking two different stores, a product, a quantity, and
// confirming) needs a multi-store account and isn't exercisable against the
// single-store seeded fixture (e2e/.auth/test-db.bin) this suite otherwise
// shares - see lib/db/queries/stock-transfers.ts's Vitest suite for that
// coverage instead. This spec only pins the gating behavior: a single-store
// account (the seeded "admin" test user) has nothing to transfer between,
// so the button must not appear and the rest of the ledger must render
// exactly as it did before this feature.
test.describe('Stock transfer entry point', () => {
  test('Transfer Stock button is hidden for a single-store account', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/ledger');

    await expect(page.getByText('Immutable log', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Transfer Stock/i })).toHaveCount(0);
  });
});
