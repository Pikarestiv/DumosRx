import { test, expect, login } from './fixtures';

/**
 * Activity Log itself is NOT plan-gated (no <LockedModuleOverlay> wraps
 * app/(dashboard)/activity-log/page.tsx, unlike Expenses/Procurement/
 * Prescriptions) — confirmed by reading the page and
 * components/dashboard/locked-module-overlay.tsx's featureKey union, which
 * has no "activity_log" entry ("audit" there maps to `canUseAuditMode`,
 * a separate stock cycle-count feature, not this page).
 *
 * The *traceable action* used to generate an entry (adding an Expense) IS
 * gated behind the paid tier, though, so this spec still needs the same
 * `elevateToPaidTier` dev-only escape hatch expenses.spec.ts uses against
 * its own isolated per-test copy of the local DB (the shared free-tier
 * fixture, e2e/.auth/test-db.bin, is intentionally left free-tier for other
 * specs that test LockedModuleOverlay itself).
 */
async function elevateToPaidTier(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await window.__e2eSetSubscriptionTier?.('pro');
  });
}

test.describe('Activity Log', () => {
  test('records a traceable action (adding an expense) with correct actor/table/action', async ({ page }) => {
    await login(page);
    await elevateToPaidTier(page);
    await page.reload();
    await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 10000 });

    // Perform a traceable action: add a uniquely-named expense (same fixture
    // pattern as e2e/expenses.spec.ts).
    await page.locator('a[href="/expenses"]').first().click();
    await expect(page.locator('header').getByText('Expenses', { exact: true })).toBeVisible();

    const description = `Activity log fixture expense ${Date.now()}`;
    await page.getByRole('button', { name: /add expense/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByPlaceholder('e.g. July shop rent').fill(description);
    await page.getByPlaceholder('0.00').fill('4321');
    await page.getByRole('button', { name: /save expense/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator(`text="${description}" >> visible=true`).first()).toBeVisible();

    // Navigate to Activity Log and confirm the entry for that expense exists,
    // sorted newest-first by default so it's the very first row (the last
    // action taken in this test run).
    await page.locator('a[href="/activity-log"]').first().click();
    await expect(page.locator('main').getByText('Activity Log', { exact: true })).toBeVisible();

    const firstRow = page.locator('[role="row"]').nth(1); // nth(0) is the header row
    await expect(firstRow).toContainText('Created a expense');
    await expect(firstRow).toContainText('expenses');

    // Open the detail panel and confirm the actor and the exact expense
    // details (Description/Amount) are the ones this test just created —
    // the real proof this is *the* entry for *this* action, not just any
    // "expenses" row.
    await firstRow.click();
    const detailPanel = page.getByText('What Changed').locator('..').locator('..');
    await expect(detailPanel.getByText(description)).toBeVisible();
    await expect(detailPanel.getByText('4321')).toBeVisible();

    const performedBy = page.getByText('Performed By').locator('xpath=following-sibling::div[1]');
    await expect(performedBy).not.toHaveText('System');
    await expect(performedBy).not.toHaveText('');
  });
});
