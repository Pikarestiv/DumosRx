import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { queryLocalDb } from './local-db';
import { ROLE_USERS, roleUsers, service } from './services-seed';
import { seedAndLogin } from './services-pos-ui';

const SERVICE = 'E2E Gated Consultation';

type Access = { add: boolean; edit: boolean; del: boolean };

const ROLES: { label: string; username: string; access: Access }[] = [
  { label: 'store owner', username: 'admin', access: { add: true, edit: true, del: true } },
  { label: 'admin', username: ROLE_USERS.admin, access: { add: true, edit: true, del: true } },
  { label: 'specialist', username: ROLE_USERS.specialist, access: { add: true, edit: true, del: false } },
  { label: 'sales_staff', username: ROLE_USERS.sales_staff, access: { add: false, edit: false, del: false } },
  { label: 'auditor', username: ROLE_USERS.auditor, access: { add: false, edit: false, del: false } },
];

async function openServicesCatalog(page: Page) {
  await page.goto('/inventory/services');
  await expect(page.getByRole('cell', { name: SERVICE, exact: true })).toBeVisible({ timeout: 15000 });
}

test.describe('Services catalog permission gating', () => {
  for (const { label, username, access } of ROLES) {
    test(`${label}: add ${access.add}, edit ${access.edit}, delete ${access.del}`, async ({ page, browser, baseURL }) => {
      test.setTimeout(90000);
      await seedAndLogin(page, browser, baseURL, (storeId) => [
        ...roleUsers(storeId),
        service(storeId, 'srv-gated', SERVICE, 3000),
      ], username);

      await openServicesCatalog(page);
      const visibility = (v: boolean) => (v ? 1 : 0);
      await expect(page.getByRole('button', { name: 'Add Service' })).toHaveCount(visibility(access.add));
      await expect(page.getByRole('button', { name: `Edit ${SERVICE}` })).toHaveCount(visibility(access.edit));
      await expect(page.getByRole('button', { name: `Delete ${SERVICE}` })).toHaveCount(visibility(access.del));

      if (access.edit) {
        await page.getByRole('button', { name: `Edit ${SERVICE}` }).click();
        await expect(page.getByRole('dialog').filter({ hasText: 'Edit Service' })).toBeVisible();
      }

      await page.goto('/inventory/services?action=add');
      const addDialog = page.getByRole('dialog').filter({ hasText: 'Add New Service' });
      if (access.add) {
        await expect(addDialog).toBeVisible({ timeout: 15000 });
      } else {
        await expect(page.getByRole('cell', { name: SERVICE, exact: true })).toBeVisible({ timeout: 15000 });
        await expect(page).not.toHaveURL(/action=add/);
        await expect(addDialog).toHaveCount(0);
      }
    });
  }

  test('creating a service with an active store stores it against that store', async ({ page, browser, baseURL }) => {
    test.setTimeout(90000);
    const storeId = await seedAndLogin(page, browser, baseURL, () => []);
    const name = `E2E Hair Styling ${Date.now()}`;

    await page.goto('/inventory/services');
    await expect(page.getByText('No services configured')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Add Service' }).first().click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Add New Service' });
    await dialog.getByLabel(/Service Name/).fill(name);
    await dialog.getByLabel(/Price/).fill('4500');
    await dialog.getByRole('button', { name: 'Create Service' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();

    const rows = await queryLocalDb(page, 'SELECT store_id, price, is_active FROM services WHERE name = ?', [name]);
    expect(rows).toEqual([{ store_id: storeId, price: 4500, is_active: 1 }]);
  });

  test('creating a service with no active store is refused', async ({ page, browser, baseURL }) => {
    test.setTimeout(90000);
    await seedAndLogin(page, browser, baseURL, () => [['UPDATE stores SET _deleted = 1']]);
    const name = `E2E Storeless Service ${Date.now()}`;

    await page.goto('/inventory/services');
    await page.getByRole('dialog', { name: 'Welcome to DumosRx' }).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Add Service' }).first().click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Add New Service' });
    await dialog.getByLabel(/Service Name/).fill(name);
    await dialog.getByLabel(/Price/).fill('1000');
    await dialog.getByRole('button', { name: 'Create Service' }).click();

    await expect(dialog.getByText('Select a store before adding a service.')).toBeVisible();
    expect(await queryLocalDb(page, 'SELECT id FROM services WHERE name = ?', [name])).toEqual([]);
  });
});
