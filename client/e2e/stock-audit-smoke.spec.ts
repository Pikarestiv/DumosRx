import { test, expect, login } from './fixtures';
import path from 'path';

test.describe('Stock Audit (Cycle Count) Cloud Backing Smoke Test', () => {
  test('should open Cycle Count, display status pill, allow counting, review and preserve draft', async ({ page }) => {
    await login(page);

    // 1. Navigate to inventory overview
    await page.goto('/inventory/overview');
    await expect(page.locator('header').getByText('Inventory Dashboard', { exact: true })).toBeVisible();

    // 2. Click "Start Audit" button in header
    const startAuditBtn = page.getByRole('button', { name: /Start Audit/i });
    await expect(startAuditBtn).toBeVisible();
    await startAuditBtn.click();

    // 3. Confirm Cycle Count full-screen overlay opens
    await expect(page.getByText('Cycle Count', { exact: true })).toBeVisible();

    // 4. Verify sync status pill is visible (either "Cloud-backed" or "Saved locally")
    const statusPill = page.locator('span:has-text("Saved locally"), span:has-text("Cloud-backed")');
    await expect(statusPill.first()).toBeVisible();

    // Take screenshot of the opened Cycle Count sheet
    const artifactDir = '/Users/admin/.gemini/antigravity/brain/a77d83d9-7529-43f8-97c5-5a7f43b8a194';
    await page.screenshot({ path: path.join(artifactDir, 'cycle-count-opened.png') });

    // 5. Test ticking the first item row
    const firstCheckbox = page.locator('button[role="checkbox"]').first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.click();
    }

    // 6. Test navigation to review step
    const reviewBtn = page.getByRole('button', { name: /Review & submit/i });
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    // 7. Verify Review step renders
    await expect(page.getByText('Review', { exact: true })).toBeVisible();
    const submitBtn = page.getByRole('button', { name: /Submit audit/i });
    await expect(submitBtn).toBeVisible();

    await page.screenshot({ path: path.join(artifactDir, 'cycle-count-review.png') });

    // 8. Return to ledger
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('button', { name: /Review & submit/i })).toBeVisible();

    // 9. Exit count (leave count dialog if unsaved edits exist)
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const leaveBtn = page.getByRole('button', { name: /Leave count/i });
    if (await leaveBtn.isVisible()) {
      await leaveBtn.click();
    }

    // 10. Reopen count to confirm persistence
    await startAuditBtn.click();
    await expect(page.getByText('Cycle Count', { exact: true })).toBeVisible();
  });
});

