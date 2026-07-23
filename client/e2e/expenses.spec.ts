import { test, expect } from './fixtures';

const today = new Date();
const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

test.describe('Expenses Module', () => {
  test('should log in, render expenses page, and add an expense', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    
    // Fill out login with the credentials    await page.getByPlaceholder(/Enter email or username/i).first().fill('admin');
    await page.keyboard.type('1234');
    await page.getByRole('button', { name: /Sign In/i }).first().click();
    
    // Wait for the dashboard to load, indicating successful login
    await expect(page.getByRole('heading', { name: /Overview/i })).toBeVisible({ timeout: 10000 });
    
    // Navigate to expenses via sidebar
    await page.locator('a[href="/expenses"]').first().click();
    await expect(page.getByRole('heading', { name: /expenses/i }).first()).toBeVisible();
    
    // Test the "Add Expense" dialog functionality
    await page.getByRole('button', { name: /add expense/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Fill out expense form
    // The datepicker uses a custom input with DD/MM/YYYY placeholder
    await page.getByPlaceholder('DD/MM/YYYY').fill(formattedDate);
    await page.getByLabel(/amount/i).fill('5000');
    await page.getByLabel(/notes/i).fill('Playwright test expense notes');
    
    await page.getByRole('button', { name: /save expense|submit/i }).click();
    
    // Verify it was added (dialog should close)
    await expect(page.getByRole('dialog')).not.toBeVisible();
    
    // Ensure the expense is listed
    await expect(page.getByText('Playwright test expense notes')).toBeVisible();
  });
});
