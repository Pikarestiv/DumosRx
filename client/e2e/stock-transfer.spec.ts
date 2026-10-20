import { test, expect, login } from './fixtures';

// Regression coverage for the Inventory > Ledger "Transfer Stock" entry point (components/stock-batch/transfer-stock-dialo…
// Rationale: docs/CLIENT_COMMENTS.md#line-e2e-stock-transfer-spec-ts-L3
test.describe('Stock transfer entry point', () => {
  test('Transfer Stock button is hidden for a single-store account', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/ledger');

    await expect(page.getByText('Immutable log', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Transfer Stock/i })).toHaveCount(0);
  });
});
