import { test, expect, login } from './fixtures';

// Reports (app/(dashboard)/reports/page.tsx) has no plan-tier gate at all — confirmed by reading lib/hooks/use-feature-gat…
// Rationale: docs/CLIENT_COMMENTS.md#block-e2e-reports-spec-ts-L3
test.describe('Reports Module', () => {
  test('should log in and render Daily Close, Operational Reports, and Analytics & Insights with real data', async ({ page }) => {
    await login(page);

    await page.locator('a[href="/reports"]').first().click();
    await expect(page.locator('header').getByText('Reporting Center', { exact: true })).toBeVisible();

    // Default tab (no ?tab= param) is Operational Reports for admins (isAdmin ? "reports" :
    // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-reports-spec-ts-L20
    await expect(page.getByText('Detailed Sales Report', { exact: true })).toBeVisible();
    await expect(page.getByText('Inventory Valuation', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Export$/i }).first()).toBeVisible();

    // Daily Close - visible to every role.
    await page.getByRole('tab', { name: /Daily Close/i }).click();
    await expect(page).toHaveURL(/tab=daily_close/);
    await expect(page.getByText(/Total Sales/i).first()).toBeVisible();
    // Exact, because "Net Cash Expected" (cash sales less the day's cash expenses) now sits below the payment-method row and a…
    // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-reports-spec-ts-L32
    await expect(page.getByText('Cash Expected', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Net Cash Expected', { exact: true }),
    ).toBeVisible();

    // Analytics & Insights (admin-only tab) - the BI key metric cards.
    await page.getByRole('tab', { name: /Analytics/i }).click();
    await expect(page).toHaveURL(/tab=analytics/);
    await expect(page.getByText('Net Sales', { exact: true })).toBeVisible();
    await expect(page.getByText('Net Profit', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sales Analytics' })).toHaveAttribute('data-state', 'active');
  });
});
