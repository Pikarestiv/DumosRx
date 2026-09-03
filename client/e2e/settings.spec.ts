import { test, expect, login } from './fixtures';

/**
 * Settings had zero dedicated e2e or unit coverage before this task (see
 * docs/features/settings.md, Step 3) despite being the single tab group
 * with the widest blast radius in the app — a role change or a sync
 * setting can silently affect every other feature. Given 21 sub-tabs, this
 * spec deliberately does NOT try to cover all of them: it follows the
 * brief's instruction to prioritize by blast radius, covering `staff`
 * (permission/role changes), `security` (auto-lock), `data`/`cloud` (sync
 * settings, directly tied to Task 0's sync-queue transaction race fix),
 * and `roles` (a placeholder — see below). Purely cosmetic tabs like
 * `appearance`/`general` (theme/color/sidebar — device-local preferences
 * with no business-state impact) are scoped out on purpose, not silently
 * skipped.
 *
 * Auto-Lock (Security) and Auto-Sync (Data) are both paid-tier features
 * (`canAutoLock`/`canCloudSync` in lib/hooks/use-feature-gate.ts, both
 * `!isFree` fallbacks), and Staff account creation is capped at 0 seats on
 * the free tier (`maxStaffAccounts`). The shared e2e fixture
 * (e2e/.auth/test-db.bin) is a free-tier store on purpose (other specs rely
 * on that to test LockedModuleOverlay), so this spec elevates its own
 * per-test copy via the same dev-only `window.__e2eSetSubscriptionTier`
 * hook `expenses.spec.ts` established, then reloads so every
 * `useFeatureGate()` consumer picks up the elevated tier from a clean
 * mount.
 */
async function elevateToPaidTier(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await window.__e2eSetSubscriptionTier?.('pro');
  });
}

test.describe('Settings', () => {
  test('staff: editing a staff member\'s role persists after reload', async ({ page }) => {
    await login(page);
    await elevateToPaidTier(page);
    await page.reload();
    await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 10000 });

    await page.goto('/settings/staff');
    await expect(page.getByRole('heading', { name: 'Staff Management' })).toBeVisible();

    // Create a fixture staff account for this test, rather than depending on
    // whatever staff rows happen to already exist in the shared fixture DB.
    const uniqueId = Date.now();
    const username = `e2estaff${uniqueId}`;

    await page.getByRole('button', { name: /^Add$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('First Name *').fill('E2E');
    await dialog.getByLabel('Last Name *').fill(`Staff${uniqueId}`);
    await dialog.getByLabel('Username *').fill(username);
    // 4-digit PIN via InputOTP: the OTP slots are individual inputs, but
    // typing into the first one fills the whole group (same pattern
    // fixtures.ts uses for the login PIN).
    await dialog.locator('input[data-input-otp="true"]').first().fill('4321');

    await dialog.getByRole('button', { name: /^Create Account$/i }).click();
    await expect(dialog).not.toBeVisible();

    // The new row should appear with its default role (Sales Staff).
    const row = page.locator('tr', { hasText: username });
    await expect(row).toBeVisible();

    // Let the "Staff account created successfully" toast (sonner, bottom
    // right, ~4s auto-dismiss) clear before the next click - otherwise it
    // can intercept the pointer event on the edit button underneath it.
    await expect(page.getByText('Staff account created successfully')).toBeVisible();
    await expect(page.getByText('Staff account created successfully')).not.toBeVisible({ timeout: 8000 });

    // Now change the role — the "real setting" this test verifies persists.
    await row.getByRole('button').first().click(); // edit (pencil) button
    const editDialog = page.getByRole('dialog');
    await expect(editDialog).toBeVisible();
    await editDialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Manager (Admin)' }).click();
    await editDialog.getByRole('button', { name: /^Save Changes$/i }).click();
    await expect(editDialog).not.toBeVisible();

    await expect(page.locator('tr', { hasText: username })).toContainText(/manager/i);

    // Reload and confirm the role change survived — this is the actual
    // persistence assertion; everything above just sets up a real change.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Staff Management' })).toBeVisible();
    await expect(page.locator('tr', { hasText: username })).toContainText(/manager/i);
  });

  test('security: changing the Auto-Lock interval persists after reload', async ({ page }) => {
    await login(page);
    await elevateToPaidTier(page);
    await page.reload();
    await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 10000 });

    await page.goto('/settings/security');
    await expect(page.getByText('Security Settings', { exact: true })).toBeVisible();

    // Default duration is 5 minutes (useAutoLockStore's initial state);
    // change it to something else and confirm the new value sticks.
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: '15 Minutes' }).click();

    // useAutoLockStore persists to localStorage on every setDuration() call
    // (no explicit Save button for this field), so a reload is enough to
    // check it stuck.
    await page.reload();
    await expect(page.getByText('Security Settings', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox')).toContainText('15 Minutes');
  });

  test('data/cloud: changing the Sync Interval persists after reload (Task 0 cross-reference)', async ({ page }) => {
    await login(page);
    await elevateToPaidTier(page);
    await page.reload();
    await expect(page.getByText(/Today's Sales/i)).toBeVisible({ timeout: 10000 });

    // /settings/cloud is a URL alias for the Data tab (use-settings-form.ts's
    // TAB_ALIASES) - visit it once to smoke-test the alias route itself. The
    // shared e2e fixture store isn't cloud-linked, so this alias also opens
    // the CloudLinkDialog (per use-settings.ts: the "cloud" alias auto-opens
    // it when !isCloudLinked) - close it, which is also regression coverage
    // for a bug found while writing this test: that effect used to depend on
    // the whole (unstable, every-render-fresh) `syncState` object instead of
    // just its stable setter, so the dialog reopened on every render and
    // could never actually be dismissed (fixed in hooks/use-settings.ts; see
    // __tests__/settings-cloud-link-dialog-loop.test.ts for the regression
    // test). Then switch to the canonical /settings/data URL for the rest of
    // this test, so a later reload doesn't re-trigger the alias's dialog-open
    // behavior (a real, intentional UX affordance, not something to fight).
    await page.goto('/settings/cloud');
    await expect(page.getByText('Data Synchronization', { exact: true })).toBeVisible();
    const cloudLinkDialog = page.getByRole('dialog', { name: 'Link DumosRx Cloud' });
    await expect(cloudLinkDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cloudLinkDialog).not.toBeVisible();
    // Confirms the fix: closing it once is enough - it does not reopen on
    // its own on a subsequent render/reload of the same page.
    await page.waitForTimeout(500);
    await expect(cloudLinkDialog).not.toBeVisible();

    await page.goto('/settings/data');
    await expect(page.getByText('Data Synchronization', { exact: true })).toBeVisible();

    // Auto-Sync must be on for the Sync Interval select to render at all
    // (data-settings-auto-sync.tsx only shows it when autoSyncEnabled).
    const autoSyncSwitch = page.getByRole('switch');
    if (!(await autoSyncSwitch.isChecked())) {
      await autoSyncSwitch.click();
    }

    // This is the UI surface for the auto-sync interval whose backend read
    // path (getPendingSyncItems() awaiting awaitSettledTransactions()) Task 0
    // fixed a transaction race in - see docs/features/settings.md's Data
    // section for the full cross-reference.
    const intervalSelect = page.getByRole('combobox');
    await expect(intervalSelect).toBeVisible();
    await intervalSelect.click();
    await page.getByRole('option', { name: 'Every 1 Hour' }).click();
    await page.getByRole('button', { name: /Save Auto-Sync Settings/i }).click();
    await expect(page.getByText('Auto-sync preferences updated')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Data Synchronization', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox')).toContainText('Every 1 Hour');
  });

  test('roles: placeholder renders (feature not yet implemented, nothing to persist)', async ({ page }) => {
    await login(page);
    // No elevateToPaidTier needed - this tab is admin-gated, not tier-gated,
    // and the seeded fixture user is the store owner/admin.
    await page.goto('/settings/roles');

    // Deliberately NOT a "change setting, reload, assert" test like the
    // three above: RolesPermissionsPlaceholder (components/settings/
    // roles-permissions-placeholder.tsx) is a static "coming soon" card with
    // no fields, toggles, or forms - there is no real setting on this page
    // to change. This assertion documents that fact in the test suite
    // itself, rather than silently omitting roles coverage or faking a
    // persistence check against a page that has nothing to persist.
    await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible();
    await expect(
      page.getByText(/Custom staff roles with fine-grained permissions are coming soon/i),
    ).toBeVisible();
  });
});
