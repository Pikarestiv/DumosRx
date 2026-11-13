import { test as base, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Logs into the seeded test store (username "admin", PIN "1234") and waits for the dashboard to render.
// Rationale: docs/CLIENT_COMMENTS.md#block-e2e-fixtures-ts-L5
export async function login(page: Page, username = 'admin') {
  await page.goto('/login');
  // Skip the first-login onboarding tour (components/dashboard/dashboard-tour.tsx):
  // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-fixtures-ts-L11
  await page.evaluate(() => {
    localStorage.setItem('dumos_client_tour_completed', 'true');
  });
  await expect(page.getByText('Initializing workspace...')).toBeHidden({ timeout: 15000 });
  await page.getByPlaceholder('admin').fill(username);
  // PIN field is an InputOTP (components/auth/traditional-login-form.tsx), not a placeholder-based text input - '••••' hasn'…
  // Rationale: docs/CLIENT_COMMENTS.md#line-e2e-fixtures-ts-L18
  await page.locator('input[data-input-otp="true"]').first().fill('1234');
  await page.getByRole('button', { name: /Authorize Entry/i }).click();
  await expect(page.getByText(/Today's Sales|My Sales Today/i).first()).toBeVisible({ timeout: 15000 });
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
  await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 15000 });
}

// Seeds IndexedDB directly on the origin before the app boots to avoid empty-DB race conditions.
export async function writeLocalDbBinary(page: Page, dbBinary: number[]) {
  await page.evaluate(async (data) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('keyval-store');
      req.onupgradeneeded = () => {
        req.result.createObjectStore('keyval');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(new Uint8Array(data), 'dumosrx_db');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, dbBinary);
}

export const test = base.extend({
  page: async ({ page }, use) => {
    // Hard-block all outbound requests to production/staging cloud APIs during E2E tests:
    await page.route(/https:\/\/(api\.)?(dev\.)?dumosrx\.com/, (route) => {
      void route.abort('blockedbyclient');
    });

    const fixturePath = path.join(__dirname, '.auth', 'test-db.bin');
    if (fs.existsSync(fixturePath)) {
      const dbBinary = Array.from(fs.readFileSync(fixturePath));

      await page.goto('/manifest.json');
      await writeLocalDbBinary(page, dbBinary);
    }

    await use(page);
  },
});

export { expect };
