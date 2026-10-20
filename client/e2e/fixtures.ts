import { test as base, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Logs into the seeded test store (username "admin", PIN "1234") and waits for the dashboard to render.
// Rationale: docs/CLIENT_COMMENTS.md#block-e2e-fixtures-ts-L5
export async function login(page: Page) {
  await page.goto('/login');
  // Skip the first-login onboarding tour (components/dashboard/dashboard-tour.tsx):
  // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-fixtures-ts-L11
  await page.evaluate(() => {
    localStorage.setItem('dumos_client_tour_completed', 'true');
  });
  await page.getByPlaceholder('admin').fill('admin');
  // PIN field is an InputOTP (components/auth/traditional-login-form.tsx), not a placeholder-based text input - '••••' hasn'…
  // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-fixtures-ts-L18
  await page.locator('input[data-input-otp="true"]').first().fill('1234');
  await page.getByRole('button', { name: /Authorize Entry/i }).click();
  await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 10000 });
}

// Logs in, then elevates the current per-test copy of the local DB to a paid tier via the dev-only `window.__e2eSetSubscri…
// Rationale: docs/CLIENT_COMMENTS.md#block-e2e-fixtures-ts-L27
export async function loginAsPaidTier(page: Page) {
  await login(page);
  await page.evaluate(async () => {
    if (!window.__e2eSetSubscriptionTier) {
      throw new Error(
        '__e2eSetSubscriptionTier dev hook is missing from window - ' +
          'expected lib/db/core.ts to expose it in development builds.',
      );
    }
    await window.__e2eSetSubscriptionTier('pro');
  });
  await page.reload();
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
