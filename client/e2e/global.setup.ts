import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

setup('create mock store and extract database', async ({ page }) => {
  // Go to setup page
  await page.goto('/setup');

  // We should be on the welcome step. Click "Set Up New Business"
  await page.getByRole('button', { name: /Set Up New Business/i }).click();

  // Now on Register step
  await page.getByLabel(/Store Name|Shop Name/i).fill('E2E Test Store');
  await page.getByLabel(/First Name/i).fill('Test');
  await page.getByLabel(/Last Name/i).fill('Admin');

  // Registration now always creates a real cloud account first (see
  // use-onboarding.ts's handleRegister: a local-only id can never be
  // reconciled with a server id later), and the server enforces BOTH email
  // and username uniqueness (`unique:users`) globally across every account
  // on the shared dev backend - not just within this store. A fixed
  // "admin"/fixed-email pair would collide with the very first successful
  // run and fail every run after with a 422 ("has already been taken"),
  // which used to get masked by too-loose a waitForURL match below (it
  // matched "/login?tab=setup&step=register" - the failure page - just as
  // happily as "/dashboard"). Both are timestamp-suffixed to stay unique per
  // run against that persistent backend.
  const runId = Date.now();
  const uniqueUsername = `e2e_${runId}`;
  const uniqueEmail = `e2e-test-${runId}@dumosrx-e2e.test`;
  await page.getByLabel(/Username/i).fill(uniqueUsername);
  await page.getByLabel(/Email Address/i).fill(uniqueEmail);
  await page.getByLabel(/Phone Number/i).fill('08012345678');
  await page.getByLabel(/^Password$/i).fill('E2eTestPassword123!');
  await page.getByLabel(/Confirm Password/i).fill('E2eTestPassword123!');

  // Fill OTP PIN
  await page.locator('input[data-input-otp="true"]').first().fill('1234');

  await page.getByRole('button', { name: /Complete Setup/i }).click();

  // Wait for the actual success signal - the dashboard - rather than a URL
  // pattern that also matches the register step's own "/login?tab=setup"
  // URL on a validation/API failure, which silently produced an empty
  // fixture DB (schema only, zero rows) on every past run without ever
  // failing this setup step.
  await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 30000 });

  // Ensure the page has fully loaded and DB is settled
  await page.waitForTimeout(2000); // Give idb a second to flush saves

  // Extract the database binary
  const dbBinary = await page.evaluate(() => {
    if (typeof window.getDatabaseBinary === 'function') {
      const bin = window.getDatabaseBinary();
      return bin ? Array.from(bin) : null; // Convert Uint8Array to normal array for JSON transfer
    }
    return null;
  });

  if (!dbBinary) {
    throw new Error('Failed to extract database binary. Ensure getDatabaseBinary is exposed on window.');
  }

  // Every other spec (via e2e/fixtures.ts's login()) expects to log in with
  // the literal username "admin" - that's baked into dozens of specs, not
  // something worth threading a per-run value through. The server-side
  // account is registered under the unique `uniqueUsername` above to avoid
  // the collision described earlier; this rewrites the LOCAL copy back to
  // "admin" before it ships as the fixture, entirely offline (sql.js run
  // here in Node, not through the browser/app) so no production code needs
  // a test-only hook for it.
  //
  // Also flips `stores.is_initialized` to 1 here. Registration's local
  // INSERT (use-onboarding.ts's handleRegister) sets it to 1 optimistically,
  // but the background `sync(false, true)` it kicks off afterward pulls the
  // server's copy of the row back down and clobbers it to 0 (the server side
  // of registration doesn't set it - this flag is purely a local "seen the
  // first-run wizard" marker, never meant to sync). Left at 0, every restored
  // copy of this fixture hits QuickSetupWizard's "Welcome to DumosRx / choose
  // your business type" modal on first render, which blocks pointer events on
  // the entire sidebar - it was the actual cause of nearly every other e2e
  // spec's login()-succeeds-but-everything-times-out-afterward failures.
  const SQL = await initSqlJs();
  const localDb = new SQL.Database(new Uint8Array(dbBinary as number[]));
  localDb.run('UPDATE users SET username = ? WHERE username = ?', ['admin', uniqueUsername]);
  localDb.run('UPDATE stores SET is_initialized = 1');
  const rewritten = localDb.export();
  localDb.close();

  // Save the binary to a fixture file
  const fixturePath = path.join(__dirname, '.auth');
  if (!fs.existsSync(fixturePath)) {
    fs.mkdirSync(fixturePath, { recursive: true });
  }

  fs.writeFileSync(path.join(fixturePath, 'test-db.bin'), Buffer.from(rewritten));
});
