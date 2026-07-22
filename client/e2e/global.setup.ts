import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

setup('create mock store and extract database', async ({ page }) => {
  // Go to setup page
  await page.goto('/setup');

  // We should be on the welcome step. Click "Create New Store"
  await page.getByRole('button', { name: /Create New Store/i }).click();

  // Now on Register step
  await page.getByLabel(/Store Name|Shop Name/i).fill('E2E Test Store');
  await page.getByLabel(/First Name/i).fill('Test');
  await page.getByLabel(/Last Name/i).fill('Admin');
  await page.getByLabel(/Username/i).fill('admin');
  
  // Fill OTP PIN
  await page.locator('input[data-input-otp="true"]').first().fill('1234');

  await page.getByRole('button', { name: /Complete Setup/i }).click();

  // Wait for the redirect to happen, indicating setup is complete
  await page.waitForURL(/.*\/dashboard|.*\/login/, { timeout: 10000 });
  
  // Ensure the page has fully loaded and DB is settled
  await page.waitForTimeout(2000); // Give idb a second to flush saves

  // Extract the database binary
  const dbBinary = await page.evaluate(() => {
    if (typeof (window as any).getDatabaseBinary === 'function') {
      const bin = (window as any).getDatabaseBinary();
      return Array.from(bin); // Convert Uint8Array to normal array for JSON transfer
    }
    return null;
  });

  if (!dbBinary) {
    throw new Error('Failed to extract database binary. Ensure getDatabaseBinary is exposed on window.');
  }

  // Save the binary to a fixture file
  const fixturePath = path.join(__dirname, '.auth');
  if (!fs.existsSync(fixturePath)) {
    fs.mkdirSync(fixturePath, { recursive: true });
  }
  
  const buffer = Buffer.from(dbBinary);
  fs.writeFileSync(path.join(fixturePath, 'test-db.bin'), buffer);
});
