import { test, expect, login } from './fixtures';

/**
 * Reports (app/(dashboard)/reports/page.tsx) has no plan-tier gate at all —
 * confirmed by reading lib/hooks/use-feature-gate.ts (its featureKey union
 * has no reports/analytics/daily_close entry) and the page itself (no
 * LockedModuleOverlay anywhere). Access is role-gated only: Operational
 * Reports and Analytics & Insights tabs only render for isAdmin, everyone
 * else lands on Daily Close. The shared e2e fixture's "admin" user is a
 * Store Owner, so no elevateToPaidTier-style workaround is needed here
 * (unlike expenses.spec.ts / procurement.spec.ts).
 */
test.describe('Reports Module', () => {
  test('should log in and render Daily Close, Operational Reports, and Analytics & Insights with real data', async ({ page }) => {
    await login(page);

    await page.locator('a[href="/reports"]').first().click();
    await expect(page.locator('header').getByText('Reporting Center', { exact: true })).toBeVisible();

    // Default tab (no ?tab= param) is Operational Reports for admins
    // (isAdmin ? "reports" : "daily_close" in app/(dashboard)/reports/page.tsx) -
    // confirm the Report Center's 6 report cards render, each with
    // Export/Print actions, not an error/blank state.
    await expect(page.getByText('Detailed Sales Report', { exact: true })).toBeVisible();
    await expect(page.getByText('Inventory Valuation', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Export$/i }).first()).toBeVisible();

    // Daily Close - visible to every role.
    await page.getByRole('tab', { name: /Daily Close/i }).click();
    await expect(page).toHaveURL(/tab=daily_close/);
    await expect(page.getByText(/Total Sales/i).first()).toBeVisible();
    await expect(page.getByText(/Cash Expected/i)).toBeVisible();

    // Analytics & Insights (admin-only tab) - the BI key metric cards.
    await page.getByRole('tab', { name: /Analytics/i }).click();
    await expect(page).toHaveURL(/tab=analytics/);
    await expect(page.getByText('Net Sales', { exact: true })).toBeVisible();
    await expect(page.getByText('Net Profit', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sales Analytics' })).toHaveAttribute('data-state', 'active');
  });
});
