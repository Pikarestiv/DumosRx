import { test, expect, login } from './fixtures';

/**
 * Expenses is gated behind a paid tier (`!isFree` fallback in
 * lib/hooks/use-feature-gate.ts, and explicitly `"expenses": false` for the
 * free tier in both the local and remote subscription_plans config), same as
 * Procurement. The shared e2e fixture (e2e/.auth/test-db.bin) is a free-tier
 * store on purpose — other specs (prescriptions.spec.ts,
 * pos-held-transaction.spec.ts) rely on that to test LockedModuleOverlay
 * itself — so this spec elevates its own isolated per-test copy of the local
 * DB instead of touching the shared fixture. Without this, these tests were
 * unknowingly racing LockedModuleOverlay's mount: the overlay took ~1s to
 * actually paint after navigation, so a fast single "Add Expense" (the
 * original test) usually beat it, but the slower edit-then-delete flow
 * (create, edit, re-open, delete) reliably lost the race and got its row
 * click intercepted by the overlay's "Upgrade Plan" backdrop once it
 * finally mounted, still correctly locked.
 */
async function elevateToPaidTier(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await window.__e2eSetSubscriptionTier?.('pro');
  });
}

test.describe('Expenses Module', () => {
  test('should log in, render expenses page, and add an expense', async ({ page }) => {
    await login(page);
    await elevateToPaidTier(page);
    // Re-navigate so StoreContext's first storeProfile read (and every
    // component that consumes useFeatureGate off it) picks up the elevated
    // tier from a clean mount, instead of relying on an invalidation racing
    // whatever's already mid-render.
    await page.reload();
    await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 10000 });

    // Navigate to expenses via sidebar
    await page.locator('a[href="/expenses"]').first().click();
    // Scoped to <header>: the sidebar nav link is also literally "Expenses".
    await expect(page.locator('header').getByText('Expenses', { exact: true })).toBeVisible();

    // Test the "Add Expense" dialog functionality
    await page.getByRole('button', { name: /add expense/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // The Date field is pre-filled with today by default (components/expenses/add-expense-dialog.tsx),
    // so only Description and Amount need filling: the form's other two required fields.
    const description = `Playwright test expense ${Date.now()}`;
    await page.getByPlaceholder('e.g. July shop rent').fill(description);
    await page.getByPlaceholder('0.00').fill('5000');

    await page.getByRole('button', { name: /save expense/i }).click();

    // Verify it was added (dialog should close)
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Ensure the expense is listed (expense-list.tsx renders the description).
    // A duplicate copy can exist off-screen (mobile/desktop dual render), so
    // match only the visible instance.
    await expect(page.locator(`text="${description}" >> visible=true`).first()).toBeVisible();
  });

  test('should edit an existing expense and then delete it', async ({ page }) => {
    await login(page);
    await elevateToPaidTier(page);
    await page.reload();
    await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 10000 });

    await page.locator('a[href="/expenses"]').first().click();
    await expect(page.locator('header').getByText('Expenses', { exact: true })).toBeVisible();

    // Create a fixture expense to edit/delete, independent of the "add" test.
    const original = `Edit-delete fixture ${Date.now()}`;
    await page.getByRole('button', { name: /add expense/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByPlaceholder('e.g. July shop rent').fill(original);
    await page.getByPlaceholder('0.00').fill('2000');
    await page.getByRole('button', { name: /save expense/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const originalRow = page.locator(`text="${original}" >> visible=true`).first();
    await expect(originalRow).toBeVisible();

    // Open the expense detail dialog, then Edit.
    await originalRow.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /^edit$/i }).click();

    // Edit dialog: change description and amount, then save.
    const updated = `${original} (edited)`;
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByPlaceholder('e.g. July shop rent').fill(updated);
    await page.getByPlaceholder('0.00').fill('3500');
    await page.getByRole('button', { name: /update expense/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Old description gone, new one visible.
    await expect(page.locator(`text="${original}" >> visible=true`)).toHaveCount(0);
    const updatedRow = page.locator(`text="${updated}" >> visible=true`).first();
    await expect(updatedRow).toBeVisible();

    // Re-open the updated expense and delete it. The detail dialog's Delete
    // button opens a second, nested ConfirmDialog while the detail dialog
    // stays mounted underneath — scope by the confirm dialog's own
    // accessible name ("Delete Expense") to avoid ambiguity between the two.
    await updatedRow.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /^delete$/i }).click();
    const confirmDialog = page.getByRole('dialog', { name: /delete expense/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /^delete$/i }).click();

    // Confirm the row is gone.
    await expect(page.locator(`text="${updated}" >> visible=true`)).toHaveCount(0);
  });
});
