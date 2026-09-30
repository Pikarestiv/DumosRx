import { test, expect, login } from './fixtures';

test.describe('Assistant Module', () => {
  test('answers a how-do-i question with a working link', async ({ page }) => {
    await login(page);

    await page.getByRole('button', { name: 'Open assistant' }).click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();

    await panel.getByLabel('Ask the assistant').fill('how do i make a sale');
    await panel.getByLabel('Ask the assistant').press('Enter');

    await expect(panel.getByText(/Make a sale: Open POS/)).toBeVisible();

    await panel.getByRole('link', { name: 'Make a sale' }).click();
    await expect(page).toHaveURL(/\/pos/);
  });

  test('answers a numeric inventory question', async ({ page }) => {
    await login(page);

    await page.getByRole('button', { name: 'Open assistant' }).click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();

    await panel.getByLabel('Ask the assistant').fill("what's low on stock");
    await panel.getByLabel('Ask the assistant').press('Enter');

    await expect(panel.getByText(/product\(s\) low on stock/)).toBeVisible();
  });
});
