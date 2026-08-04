import { test as base, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/** Logs into the seeded test store (username "admin", PIN "1234") and waits
 * for the dashboard to render. Centralized here so every spec uses the same
 * selectors as the real login form (components/auth/traditional-login-form.tsx)
 * instead of each spec guessing its own copy that can drift out of sync. */
export async function login(page: Page) {
  await page.goto('/login');
  // Skip the first-login onboarding tour (components/dashboard/dashboard-tour.tsx)
  // — its react-joyride overlay otherwise intercepts pointer events on the
  // sidebar/header for every fresh test-store session and blocks clicks.
  await page.evaluate(() => {
    localStorage.setItem('dumos_client_tour_completed', 'true');
  });
  await page.getByPlaceholder('admin').fill('admin');
  await page.getByPlaceholder('••••').fill('1234');
  await page.getByRole('button', { name: /Authorize Entry/i }).click();
  await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 10000 });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    // Go to a known page to ensure we can execute script in context
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const fixturePath = path.join(__dirname, '.auth', 'test-db.bin');
    if (fs.existsSync(fixturePath)) {
      const dbBinary = fs.readFileSync(fixturePath);
      // Pass it as an array of numbers so it can be serialized into the browser context
      const binaryArray = Array.from(dbBinary);
      
      await page.evaluate(async (data) => {
        // Wait for window.restoreDatabase to be available
        let attempts = 0;
        while (typeof window.restoreDatabase !== 'function' && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }

        if (typeof window.restoreDatabase === 'function') {
          const uint8 = new Uint8Array(data);
          await window.restoreDatabase(uint8);
        } else {
          console.error("restoreDatabase not found on window");
        }
      }, binaryArray);
      
      // Reload page so it picks up the DB instead of Setup
      await page.reload();
    }

    await use(page);
  },
});

export { expect };
