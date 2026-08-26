import { test, expect, login } from './fixtures';

test.describe('Expenses Module', () => {
  test('should log in, render expenses page, and add an expense', async ({ page }) => {
    await login(page);

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
});
