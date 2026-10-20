import { test, expect, login } from './fixtures';

// Baseline flow coverage for Prescriptions (docs/features/prescriptions.md):
// Rationale: docs/CLIENT_COMMENTS.md#block-e2e-prescriptions-spec-ts-L3
test.describe('Prescriptions Module', () => {
  test('should log in, navigate to prescriptions, and create a prescription', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);

    // The seeded test store's Business Vertical defaults to "General", which hides the Prescriptions nav link entirely (dashbo…
    // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-prescriptions-spec-ts-L21
    await page.goto('/settings/business-info');
    await page.getByRole('button', { name: 'Pharmacy', exact: true }).click();
    await expect(page.getByText('Switched to Pharmacy mode')).toBeVisible();

    const productName = `Rx Test Paracetamol ${Date.now()}`;

    await page.goto('/inventory/catalog');
    await page.getByRole('button', { name: /Add Product/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(productName);
    await page.getByLabel(/Selling Price/i).first().fill('500');
    await page.getByLabel(/Reorder Level/i).first().fill('5');
    await page.getByRole('button', { name: /^Add Product$/i }).last().click();
    await expect(page.getByText('Add New Product', { exact: true })).not.toBeVisible();

    // Give it real stock via a Cycle Count (same mechanics as
    // pos-held-transaction.spec.ts; audit-ledger-step.tsx renders the count
    // grid as ARIA role="row"/"cell" divs, so locate the row via the
    // product-name cell's nearest role="row" ancestor).
    await page.getByRole('button', { name: /Start Audit/i }).click();
    await expect(page.getByText('Physical inventory')).toBeVisible();

    const searchBox = page.getByPlaceholder(/Search by name or SKU/i).first();
    await searchBox.fill(productName);
    const nameCell = page.getByText(productName, { exact: true }).first();
    await expect(nameCell).toBeVisible();
    const row = nameCell.locator('xpath=ancestor::*[@role="row"]').first();
    const countedQtyInput = row.locator('input[type="number"]').first();
    await countedQtyInput.fill('20');
    await countedQtyInput.blur();

    await page.getByRole('button', { name: /Review & submit/i }).click();
    await page.getByRole('button', { name: /Submit audit/i }).click();
    await expect(page.getByText('Audit submitted', { exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Close Audit/i }).click();

    // Now the actual Prescriptions walkthrough.
    await page.locator('a[href="/prescriptions"]').first().click();
    // Scoped to <header>: the sidebar nav link is also literally "Prescriptions".
    await expect(page.locator('header').getByText('Prescription Management', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Create Prescription/i }).click();
    await expect(page.getByText('Create New Prescription', { exact: true })).toBeVisible();

    const patientName = `Playwright${Date.now()}`;
    await page.getByPlaceholder('Enter patient name').fill(patientName);
    await page.getByPlaceholder('08012345678').fill('08011112222');
    await page.getByPlaceholder('Dr. John Smith').fill('Dr. Playwright Tester');
    await page.getByPlaceholder('MD-12345').fill('MD-00000');

    // Product Name / Strength are comboboxes (components/ui/combobox.tsx,
    // built on cmdk) sourced from this store's available stock batches.
    // Strength is sourced from the product's own `strength` column, which a
    // quick-added product never sets — the dropdown legitimately has zero
    // options in that case (see docs/features/prescriptions.md), and the
    // medication is still addable since the match falls back to an empty
    // string on both sides, so only Product Name needs picking here.
    await page.getByText('Select product', { exact: true }).click();
    await page.locator('[cmdk-item]', { hasText: productName }).click();

    await page.getByPlaceholder('e.g., 3 times daily').fill('Take 1 tablet twice daily');
    await page.getByRole('button', { name: /Add Medication/i }).click();
    await expect(page.getByText('Prescribed Medications (1)', { exact: true })).toBeVisible();

    // Two "Create Prescription" buttons exist at this point: the page header
    // action (behind the full-screen New Prescription overlay, still in the
    // DOM) and this form's real submit button — scope to the submit button
    // via its type attribute.
    await page.locator('button[type="submit"]', { hasText: 'Create Prescription' }).click();

    await expect(page.getByText(/Prescription created successfully/i)).toBeVisible();
    // Back on the queue, the new prescription is visible and starts out
    // "Needs verification" (use-save-prescription-mutation.ts).
    await expect(page.locator(`text="${patientName}" >> visible=true`).first()).toBeVisible();
    await expect(page.locator('text="Needs verification" >> visible=true').first()).toBeVisible();
  });
});
