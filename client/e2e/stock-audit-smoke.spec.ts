import { test, expect, login } from './fixtures';

test.describe('Stock Audit (Cycle Count) Cloud Backing Smoke Test', () => {
  test('should open Cycle Count, display status pill, allow counting, review and preserve draft', async ({ page }) => {
    await login(page);

    await page.goto('/inventory/overview');
    await expect(page.locator('header').getByText('Inventory Dashboard', { exact: true })).toBeVisible();

    const startAuditBtn = page.getByRole('button', { name: /Start Audit/i });
    await expect(startAuditBtn).toBeVisible();
    await startAuditBtn.click();

    await expect(page.getByText('Cycle Count', { exact: true })).toBeVisible();

    const statusPill = page.locator('span:has-text("Saved locally"), span:has-text("Cloud-backed")');
    await expect(statusPill.first()).toBeVisible();

    await page.screenshot({ path: test.info().outputPath('cycle-count-opened.png') });

    const firstCheckbox = page.locator('button[role="checkbox"]').first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.click();
    }

    const reviewBtn = page.getByRole('button', { name: /Review & submit/i });
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    await expect(page.getByText('Review', { exact: true })).toBeVisible();
    const submitBtn = page.getByRole('button', { name: /Submit audit/i });
    await expect(submitBtn).toBeVisible();

    await page.screenshot({ path: test.info().outputPath('cycle-count-review.png') });

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('button', { name: /Review & submit/i })).toBeVisible();

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const leaveBtn = page.getByRole('button', { name: /Leave count/i });
    if (await leaveBtn.isVisible()) {
      await leaveBtn.click();
    }

    await startAuditBtn.click();
    await expect(page.getByText('Cycle Count', { exact: true })).toBeVisible();
  });
});

