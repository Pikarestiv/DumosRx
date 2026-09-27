# Roles & Permission Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client's 6 hardcoded role-string permission helpers (`checkIsAdmin`, `checkCanManageStockBatch`, `checkCanProcessSales`, `checkCanRequestStockTransfer`, `checkCanViewAllActivity`, `checkCanFactoryReset`) with a data-driven, store-scoped, fully-offline "permission group" system the store owner can view and edit, QuickBooks-Security-screen style.

**Architecture:** A new `permission_groups` table (store-scoped, one row per group, permissions stored as a JSON array in a single TEXT column — same convention as `stores.enabled_payment_methods`) syncs like any other store-owned resource. `users.permission_group_id` points a staff member at one. `hasPermission(user, group, key)` / `useHasPermission(key)` replace the 6 old helpers, falling back to today's exact role-string logic whenever a device has no synced group data yet. The existing `role` string and its privilege-hierarchy security guards (`roleIsAtOrBelowCallerPrivilege`, `USER_SYNC_ASSIGNABLE_ROLES`) are untouched — a group's `based_on_role` only feeds that existing machinery, it never caps the group's own checkbox set (the acting user's own effective permissions do that, server-side, to prevent escalation).

**Tech Stack:** Next.js/TypeScript (`client/`, sql.js/native-SQLite dual backend), Laravel 11/PHP 8.2 (`laravel-server/`, MySQL).

**Spec:** `docs/superpowers/specs/2026-09-27-roles-and-permissions-design.md`

## Global Constraints

- `permission_groups.permissions` is a JSON array stored in a TEXT column, never a relational pivot — matches `stores.enabled_payment_methods`/`custom_units`.
- The existing `role` string column, `checkCanRequestStockTransfer`'s composition logic name, and every existing sync privilege-ceiling guard (`USER_SYNC_FORBIDDEN_FIELDS`, `USER_SYNC_ASSIGNABLE_ROLES`, `roleIsAtOrBelowCallerPrivilege`) stay exactly as they are today. Nothing in this plan renames, removes, or reroutes them.
- Default groups (`Manager`, `Specialist`, `Sales Staff`, `Auditor`, `Admin`) can never be renamed or deleted, in the UI or at the data/sync layer. Only custom (`is_default = 0`) groups can be renamed/deleted, and only once no active staff are assigned to them.
- A `permission_groups` row's checkbox set can never be pushed containing a permission key the pushing user doesn't themselves currently hold (server-side enforced, `store_owner`/`admin`/`super_admin` bypass).
- `permission_group_id` on `users` is added to the sync engine's existing self-edit exclusion list (same treatment as `role`/`store_id`/`is_active` today) — a staff member can never grant themselves a more powerful group via their own sync push.
- Every new column is added to BOTH sides in the same task that introduces it: client `schema.ts` + `schema-migrations.ts` `SYNC_COLUMN_MIGRATIONS`, and the matching Laravel migration + model `$fillable`/cast — per this repo's own documented "synced column added only on one side" failure pattern (see `laravel-server/AGENTS.md`).
- `store_owner` and `super_admin` are never group-assigned — `hasPermission()` short-circuits to "everything granted" for them, matching today's behavior where the owner can never lock themselves out.
- Two existing role-string checks are explicitly OUT of scope for migration because they inspect a role belonging to someone OTHER than the acting user (a staff list row's badge, a stock transfer's original initiator) rather than gating the current actor's own permissions: `components/settings/staff/staff-list.tsx:158,163,319` and `lib/db/queries/stock-transfers.ts:277`. These keep calling the plain role-string check directly; only the current-actor-gating call sites in Task 8 are migrated.

## Review Focus

- A brand-new device (or a store created before this feature shipped) that hasn't yet synced its store's `permission_groups` rows down must still let every existing role do exactly what it does today — not lock everyone out and not open everything up (Task 5's fallback path, tested in Task 5 and re-verified end-to-end in Task 9).
- A non-owner/non-admin staff member must never be able to push a `permission_groups` edit that grants a permission they don't themselves hold, even by editing a group they're not currently a member of (Task 11).
- A staff member must never be able to self-assign `permission_group_id` to a more powerful group via their own sync push, mirroring the existing `role`/`store_id` self-edit exclusion (Task 11).
- Deleting a custom group that still has active staff assigned must be blocked with a clear message, both in the UI (Task 10) and if bypassed via a direct API/sync call (Task 11).
- Reverting a default group whose checkboxes were edited must restore the exact original seeded permission set for that role, not some other role's set or an empty one (Task 4's revert helper, tested in Task 10).

---

## Task 1: Client schema — `permission_groups`, `users.permission_group_id`, `stores.permission_groups_seeded_at`

**Files:**
- Modify: `client/lib/db/schema.ts` (add `permission_groups` CREATE TABLE; add `permission_group_id`/`permission_groups_seeded_at` to `users`/`stores` CREATE TABLEs)
- Modify: `client/lib/db/schema-migrations.ts` (`SYNC_COLUMN_MIGRATIONS` entries for existing local DBs)
- Test: `client/__tests__/permission-groups-schema.test.ts`

**Interfaces:**
- Produces: the `permission_groups` table shape every later client task reads/writes: `id TEXT PRIMARY KEY, store_id TEXT, name TEXT, based_on_role TEXT, is_default INTEGER DEFAULT 0, permissions TEXT, created_at TEXT, updated_at TEXT, _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _synced_at TEXT, _deleted INTEGER DEFAULT 0`.

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/permission-groups-schema.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type Database } from "sql.js";

describe("permission_groups schema", () => {
  let db: Database;

  beforeAll(async () => {
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
  });

  it("creates permission_groups with the expected columns", () => {
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions, created_at)
       VALUES ('pg1', 'store1', 'Manager', 'manager', 1, '["process_sales"]', '2026-01-01')`,
    );
    const result = db.exec("SELECT * FROM permission_groups WHERE id = 'pg1'");
    expect(result[0].values[0]).toContain("Manager");
  });

  it("users has a permission_group_id column", () => {
    db.run(`INSERT INTO users (id, role) VALUES ('u1', 'manager')`);
    expect(() =>
      db.run(`UPDATE users SET permission_group_id = 'pg1' WHERE id = 'u1'`),
    ).not.toThrow();
  });

  it("stores has a permission_groups_seeded_at column", () => {
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    expect(() =>
      db.run(`UPDATE stores SET permission_groups_seeded_at = '2026-01-01' WHERE id = 'store1'`),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/permission-groups-schema.test.ts`
Expected: FAIL — "table permission_groups doesn't exist" (or similar) for at least the first assertion.

- [ ] **Step 3: Add the table and columns**

In `client/lib/db/schema.ts`, add a new CREATE TABLE block (place it near the other store-scoped tables, e.g. right after `payment_accounts`):

```sql
CREATE TABLE IF NOT EXISTS permission_groups (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  name TEXT NOT NULL,
  based_on_role TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);
```

In the same file's `users` CREATE TABLE, add `permission_group_id TEXT,` (right after `is_active INTEGER DEFAULT 1,`, matching where `auto_lock_duration` was added). In the `stores` CREATE TABLE, add `permission_groups_seeded_at TEXT,` (near `loyalty_defaults_seeded_at`).

In `client/lib/db/schema-migrations.ts`'s `SYNC_COLUMN_MIGRATIONS` array, add an entry so existing local DBs get the columns via `ALTER TABLE`:

```ts
{
  table: "permission_groups",
  columns: [
    "store_id TEXT",
    "name TEXT",
    "based_on_role TEXT",
    "is_default INTEGER DEFAULT 0",
    "permissions TEXT DEFAULT '[]'",
    "created_at TEXT",
    "updated_at TEXT",
    "_version INTEGER DEFAULT 1",
    "_synced INTEGER DEFAULT 0",
    "_synced_at TEXT",
    "_deleted INTEGER DEFAULT 0",
  ],
},
```

And find the existing `users` entry in that same array; add `"permission_group_id TEXT"` to its `columns` list. Find the existing `stores` entry; add `"permission_groups_seeded_at TEXT"` to its `columns` list.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/permission-groups-schema.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd client && git add lib/db/schema.ts lib/db/schema-migrations.ts __tests__/permission-groups-schema.test.ts
git commit -m "feat: add permission_groups table and related columns to client schema"
```

---

## Task 2: Server schema — `permission_groups` table, `users.permission_group_id`, `stores.permission_groups_seeded_at`

**Files:**
- Create: `laravel-server/database/migrations/2026_09_27_000003_create_permission_groups_table.php`
- Create: `laravel-server/database/migrations/2026_09_27_000004_add_permission_group_id_to_users_table.php`
- Create: `laravel-server/database/migrations/2026_09_27_000005_add_permission_groups_seeded_at_to_stores_table.php`
- Create: `laravel-server/app/Models/PermissionGroup.php`
- Modify: `laravel-server/app/Models/User.php` (`$fillable`)
- Modify: `laravel-server/app/Models/Store.php` (`$fillable`)
- Test: `laravel-server/tests/Feature/PermissionGroupModelTest.php`

**Interfaces:**
- Produces: `App\Models\PermissionGroup` — `belongsTo(Store::class)`, fillable `store_id, name, based_on_role, is_default, permissions, _version`, `permissions` cast to `array`.

- [ ] **Step 1: Write the failing test**

```php
<?php
// laravel-server/tests/Feature/PermissionGroupModelTest.php

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;

test('a permission group belongs to a store and casts permissions to an array', function () {
    $store = Store::factory()->create();
    $group = PermissionGroup::create([
        'store_id' => $store->id,
        'name' => 'Manager',
        'based_on_role' => 'manager',
        'is_default' => true,
        'permissions' => ['process_sales', 'manage_inventory'],
    ]);

    expect($group->store->id)->toBe($store->id);
    expect($group->permissions)->toBe(['process_sales', 'manage_inventory']);
});

test('a user can be assigned a permission group', function () {
    $store = Store::factory()->create();
    $group = PermissionGroup::create([
        'store_id' => $store->id,
        'name' => 'Manager',
        'based_on_role' => 'manager',
        'is_default' => true,
        'permissions' => [],
    ]);
    $user = User::factory()->create(['store_id' => $store->id]);
    $user->update(['permission_group_id' => $group->id]);

    expect($user->fresh()->permission_group_id)->toBe($group->id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=PermissionGroupModelTest`
Expected: FAIL — class `PermissionGroup` not found / column doesn't exist.

- [ ] **Step 3: Write the migrations and model**

```php
<?php
// laravel-server/database/migrations/2026_09_27_000003_create_permission_groups_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Store-scoped counterpart to the client's `permission_groups` table (see
 * client/lib/db/schema.ts). Deliberately separate from the existing
 * platform-scoped `roles`/`permissions` tables (RolesAndPermissionsSeeder)
 * - those mean the same thing for every store and already carry specific
 * meaning for super_admin/platform_admin/agent. A store-level, owner-
 * editable group is a different concept and must never risk being confused
 * with (or accidentally shared across) the platform-level Role model.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permission_groups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id');
            $table->string('name');
            $table->string('based_on_role');
            $table->boolean('is_default')->default(false);
            $table->json('permissions')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->unsignedInteger('_version')->default(1);
            $table->timestamps();

            $table->foreign('store_id')->references('id')->on('stores')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('permission_groups');
    }
};
```

```php
<?php
// laravel-server/database/migrations/2026_09_27_000004_add_permission_group_id_to_users_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->uuid('permission_group_id')->nullable()->after('auto_lock_duration');
            $table->foreign('permission_group_id')->references('id')->on('permission_groups')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['permission_group_id']);
            $table->dropColumn('permission_group_id');
        });
    }
};
```

```php
<?php
// laravel-server/database/migrations/2026_09_27_000005_add_permission_groups_seeded_at_to_stores_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Server-side counterpart to client stores.permission_groups_seeded_at -
// mirrors the existing loyalty_defaults_seeded_at lazy-seed marker pattern.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->timestamp('permission_groups_seeded_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('permission_groups_seeded_at');
        });
    }
};
```

```php
<?php
// laravel-server/app/Models/PermissionGroup.php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PermissionGroup extends Model
{
    use HasUuids;

    protected $fillable = [
        'store_id',
        'name',
        'based_on_role',
        'is_default',
        'permissions',
        '_version',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'permissions' => 'array',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
```

Add `'permission_group_id'` to `User::$fillable` (`laravel-server/app/Models/User.php`, alongside `auto_lock_duration`). Add `'permission_groups_seeded_at'` to `Store::$fillable` (`laravel-server/app/Models/Store.php`, alongside `loyalty_defaults_seeded_at` if present, or near `require_sale_notes`).

- [ ] **Step 4: Run migrations and the test**

Run: `cd laravel-server && php artisan migrate --force && php artisan test --filter=PermissionGroupModelTest`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd laravel-server && git add database/migrations/2026_09_27_000003_create_permission_groups_table.php \
  database/migrations/2026_09_27_000004_add_permission_group_id_to_users_table.php \
  database/migrations/2026_09_27_000005_add_permission_groups_seeded_at_to_stores_table.php \
  app/Models/PermissionGroup.php app/Models/User.php app/Models/Store.php \
  tests/Feature/PermissionGroupModelTest.php
git commit -m "feat: add PermissionGroup model, users.permission_group_id, stores.permission_groups_seeded_at"
```

---

## Task 3: Sync engine wiring — `permission_groups` syncs like any other store-owned table

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/App/SyncController.php:669` (add `'permission_groups'` to the syncable `$tables` array)
- Modify: `laravel-server/app/Http/Controllers/Api/App/SyncController.php:1850-1856` (`getModelForTable()` — add `'permission_groups' => PermissionGroup::class`)
- Test: `laravel-server/tests/Feature/PermissionGroupSyncTest.php`

**Interfaces:**
- Consumes: `PermissionGroup` (Task 2).
- Produces: confirms `permission_groups` round-trips through the standard push/pull path with no special-casing (unlike `audit_logs`).

- [ ] **Step 1: Write the failing test**

```php
<?php
// laravel-server/tests/Feature/PermissionGroupSyncTest.php

use App\Models\Store;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

test('a permission_groups INSERT push creates the row and a pull returns it', function () {
    $store = Store::factory()->create();
    $user = User::factory()->create(['store_id' => $store->id]);
    Sanctum::actingAs($user);

    $groupId = (string) \Illuminate\Support\Str::uuid();
    $response = $this->postJson('/api/app/sync/push', [
        'changes' => [[
            'id' => 1,
            'table_name' => 'permission_groups',
            'record_id' => $groupId,
            'operation' => 'INSERT',
            'payload' => [
                'id' => $groupId,
                'store_id' => $store->id,
                'name' => 'Supervisor',
                'based_on_role' => 'manager',
                'is_default' => false,
                'permissions' => ['process_sales'],
            ],
        ]],
    ]);

    $response->assertOk();
    $this->assertDatabaseHas('permission_groups', ['id' => $groupId, 'name' => 'Supervisor']);

    $pullResponse = $this->getJson('/api/app/sync/pull?table=permission_groups');
    $pullResponse->assertOk();
    expect(collect($pullResponse->json('data'))->pluck('id'))->toContain($groupId);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=PermissionGroupSyncTest`
Expected: FAIL — table not recognized as syncable / not returned by pull.

- [ ] **Step 3: Wire the table in**

In `SyncController.php`, find the `$tables` array (line ~669) and add `'permission_groups'` to the list. Find `getModelForTable()`'s match array (line ~1850) and add:

```php
'permission_groups' => PermissionGroup::class,
```

Add `use App\Models\PermissionGroup;` to the controller's imports if not already present via another reference.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=PermissionGroupSyncTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd laravel-server && git add app/Http/Controllers/Api/App/SyncController.php tests/Feature/PermissionGroupSyncTest.php
git commit -m "feat: sync permission_groups through the standard push/pull path"
```

---

## Task 4: Permission catalog constant + default-group permission sets

**Files:**
- Create: `client/lib/constants/permissions.ts`
- Test: `client/__tests__/permission-catalog.test.ts`

**Interfaces:**
- Produces: `PERMISSION_CATALOG` (the ~30 permission keys/labels/categories from the spec), `DEFAULT_GROUP_PERMISSIONS: Record<StaffRole, string[]>` (the exact permission set each default group is seeded with — used by Task 5's seeding and Task 10's "Revert to Default").

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/permission-catalog.test.ts
import { describe, it, expect } from "vitest";
import { PERMISSION_CATALOG, DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";

describe("permission catalog", () => {
  it("every default role has a defined permission set", () => {
    expect(Object.keys(DEFAULT_GROUP_PERMISSIONS).sort()).toEqual(
      ["admin", "auditor", "manager", "sales_staff", "specialist"].sort(),
    );
  });

  it("every permission key in DEFAULT_GROUP_PERMISSIONS exists in the catalog", () => {
    const catalogKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
    for (const role of Object.keys(DEFAULT_GROUP_PERMISSIONS) as (keyof typeof DEFAULT_GROUP_PERMISSIONS)[]) {
      for (const key of DEFAULT_GROUP_PERMISSIONS[role]) {
        expect(catalogKeys.has(key)).toBe(true);
      }
    }
  });

  it("admin's default set is a superset of manager's", () => {
    const adminSet = new Set(DEFAULT_GROUP_PERMISSIONS.admin);
    for (const key of DEFAULT_GROUP_PERMISSIONS.manager) {
      expect(adminSet.has(key)).toBe(true);
    }
  });

  it("auditor cannot process sales but can view reports", () => {
    expect(DEFAULT_GROUP_PERMISSIONS.auditor).not.toContain("process_sales");
    expect(DEFAULT_GROUP_PERMISSIONS.auditor).toContain("view_reports");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/permission-catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the catalog**

```ts
// client/lib/constants/permissions.ts

/** Stable permission keys - referenced by permission_groups.permissions
 * (a JSON array of these), never renamed once shipped (old synced rows
 * would silently lose that grant). Grouped into categories for the
 * Roles & Permissions matrix UI (Task 9). */
export interface PermissionCatalogEntry {
  key: string;
  label: string;
  category:
    | "Sales & POS"
    | "Inventory & Stock"
    | "Prescriptions"
    | "Customers & Loyalty"
    | "Reports & Activity"
    | "Expenses"
    | "Staff & Groups"
    | "Store & Settings";
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  { key: "process_sales", label: "Process Sales", category: "Sales & POS" },
  { key: "apply_discounts", label: "Apply Discounts", category: "Sales & POS" },
  { key: "void_refund_sales", label: "Void / Refund Sales", category: "Sales & POS" },
  { key: "open_cash_drawer", label: "Open Cash Drawer (no sale)", category: "Sales & POS" },
  { key: "override_price", label: "Override Price at Checkout", category: "Sales & POS" },

  { key: "manage_products", label: "Manage Products & Categories", category: "Inventory & Stock" },
  { key: "manage_stock_batches", label: "Manage Stock Batches", category: "Inventory & Stock" },
  { key: "adjust_stock_counts", label: "Adjust Stock Counts", category: "Inventory & Stock" },
  { key: "manage_purchase_orders", label: "Manage Purchase Orders", category: "Inventory & Stock" },
  { key: "receive_purchase_orders", label: "Receive Purchase Orders", category: "Inventory & Stock" },
  { key: "manage_suppliers", label: "Manage Suppliers", category: "Inventory & Stock" },
  { key: "request_stock_transfers", label: "Request Stock Transfers", category: "Inventory & Stock" },
  { key: "approve_stock_transfers", label: "Approve Incoming Stock Transfers", category: "Inventory & Stock" },

  { key: "dispense_prescriptions", label: "Dispense Prescriptions", category: "Prescriptions" },
  { key: "manage_prescriptions", label: "Manage Prescription Records", category: "Prescriptions" },

  { key: "manage_customers", label: "Manage Customers", category: "Customers & Loyalty" },
  { key: "manage_loyalty", label: "Manage Loyalty Program", category: "Customers & Loyalty" },

  { key: "view_reports", label: "View Reports & Analytics", category: "Reports & Activity" },
  { key: "export_reports", label: "Export / Print Reports", category: "Reports & Activity" },
  { key: "view_activity_log", label: "View Activity Log", category: "Reports & Activity" },

  { key: "record_expenses", label: "Record Expenses", category: "Expenses" },
  { key: "view_all_expenses", label: "View All Expenses", category: "Expenses" },

  { key: "manage_staff", label: "Manage Staff", category: "Staff & Groups" },
  { key: "manage_roles_permissions", label: "Manage Roles & Permission Groups", category: "Staff & Groups" },

  { key: "manage_store_settings", label: "Manage Store Settings", category: "Store & Settings" },
  { key: "manage_payment_accounts", label: "Manage Payment Accounts", category: "Store & Settings" },
  { key: "manage_online_store", label: "Manage Online Store", category: "Store & Settings" },
  { key: "manage_billing", label: "Manage Subscription & Billing", category: "Store & Settings" },
  { key: "backup_restore_data", label: "Backup / Restore Local Data", category: "Store & Settings" },
  { key: "factory_reset", label: "Factory Reset Device", category: "Store & Settings" },
];

/**
 * The exact permission set each default group is seeded with (Task 5) and
 * restored to by "Revert to Default" (Task 10) - derived to reproduce
 * today's 6-helper behavior exactly for each role, so migrating an
 * existing store changes nothing on day one. Cross-referenced against
 * auth-context.tsx's checkIsAdmin/checkCanManageStockBatch/
 * checkCanProcessSales/checkCanViewAllActivity/checkCanFactoryReset arrays
 * as they stood before Task 8's migration.
 */
export const DEFAULT_GROUP_PERMISSIONS: Record<
  "admin" | "manager" | "specialist" | "sales_staff" | "auditor",
  string[]
> = {
  admin: PERMISSION_CATALOG.map((p) => p.key), // admin/store_owner-tier: everything
  manager: [
    "process_sales", "apply_discounts", "void_refund_sales", "open_cash_drawer", "override_price",
    "manage_products", "manage_stock_batches", "adjust_stock_counts", "manage_purchase_orders",
    "receive_purchase_orders", "manage_suppliers", "request_stock_transfers", "approve_stock_transfers",
    "dispense_prescriptions", "manage_prescriptions",
    "manage_customers", "manage_loyalty",
    "view_reports", "export_reports",
    "record_expenses", "view_all_expenses",
    "manage_staff",
    "manage_store_settings", "manage_payment_accounts", "manage_online_store", "backup_restore_data",
    // NOT: view_activity_log, manage_roles_permissions, manage_billing, factory_reset
    // (checkCanViewAllActivity/checkCanFactoryReset both exclude "manager" today)
  ],
  specialist: [
    "process_sales",
    "manage_products", "manage_stock_batches", "adjust_stock_counts", "manage_purchase_orders",
    "receive_purchase_orders", "manage_suppliers", "request_stock_transfers",
    "dispense_prescriptions", "manage_prescriptions",
    "manage_customers",
    "record_expenses",
    // NOT: void_refund_sales/apply_discounts/open_cash_drawer/override_price (checkIsAdmin-only today),
    // NOT: view_reports/export_reports/view_activity_log/manage_staff/manage_* settings
  ],
  sales_staff: [
    "process_sales",
    "manage_customers",
    "record_expenses",
    // sales_staff has no other grant under any of today's 6 helpers
  ],
  auditor: [
    "view_reports", "export_reports", "view_all_expenses",
    // auditor is read-only today: no process_sales, no manage_* grants
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/permission-catalog.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd client && git add lib/constants/permissions.ts __tests__/permission-catalog.test.ts
git commit -m "feat: add permission catalog and default group permission sets"
```

---

## Task 5: Default-group seeding + `hasPermission`/`useHasPermission` enforcement mechanism

**Files:**
- Create: `client/lib/db/queries/permission-groups.ts`
- Create: `client/lib/hooks/use-permissions.ts`
- Modify: `client/lib/context/auth-context.tsx` (trigger seeding on user change — see Step 3)
- Test: `client/__tests__/permission-groups-seeding.test.ts`
- Test: `client/__tests__/use-has-permission.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_GROUP_PERMISSIONS` (Task 4), `User` type (`auth-context.tsx`).
- Produces:
  - `ensurePermissionGroupsSeeded(): Promise<void>` — idempotent, mirrors `ensureLoyaltyDefaultsSeeded`'s gate-on-timestamp pattern.
  - `getUserPermissionGroup(userId: string): Promise<{ id: string; permissions: string[] } | null>`
  - `hasPermission(user: { role: string; permission_group_id?: string | null } | null, group: { permissions: string[] } | null, key: string | string[], mode?: "any" | "all"): boolean` — pure function, the fallback-aware core logic.
  - `useHasPermission(key: string | string[], mode?: "any" | "all"): boolean` — React hook wrapping `hasPermission` against the current session.

- [ ] **Step 1: Write the failing seeding test**

```ts
// client/__tests__/permission-groups-seeding.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("ensurePermissionGroupsSeeded", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let ensurePermissionGroupsSeeded: typeof import("@/lib/db/queries/permission-groups").ensurePermissionGroupsSeeded;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ ensurePermissionGroupsSeeded } = await import("@/lib/db/queries/permission-groups"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM stores; DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    core.setActiveStoreId("store1");
  });

  it("creates all 5 default groups for a store that has never been seeded", async () => {
    await ensurePermissionGroupsSeeded();

    const groups = await core.query<{ name: string; is_default: number; based_on_role: string }>(
      `SELECT name, is_default, based_on_role FROM permission_groups WHERE store_id = 'store1'`,
    );
    expect(groups).toHaveLength(5);
    expect(groups.every((g) => g.is_default === 1)).toBe(true);
    expect(groups.map((g) => g.based_on_role).sort()).toEqual(
      ["admin", "auditor", "manager", "sales_staff", "specialist"].sort(),
    );
  });

  it("is a no-op the second time it's called for the same store", async () => {
    await ensurePermissionGroupsSeeded();
    await ensurePermissionGroupsSeeded();

    const groups = await core.query(`SELECT id FROM permission_groups WHERE store_id = 'store1'`);
    expect(groups).toHaveLength(5);
  });

  it("does not reseed a store that deliberately deleted its default groups after seeding once", async () => {
    await ensurePermissionGroupsSeeded();
    await core.execute(`UPDATE permission_groups SET _deleted = 1 WHERE store_id = 'store1'`, []);

    await ensurePermissionGroupsSeeded();

    const active = await core.query(`SELECT id FROM permission_groups WHERE store_id = 'store1' AND _deleted = 0`);
    expect(active).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/permission-groups-seeding.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement seeding**

```ts
// client/lib/db/queries/permission-groups.ts
import { query, execute, transaction, getActiveStoreId, generateId } from "@/lib/db/core";
import { insert, update } from "@/lib/db/base-helpers";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";

/**
 * Seeds the 5 default permission groups (Manager, Specialist, Sales Staff,
 * Auditor, Admin) the first time this feature touches a store, exactly
 * mirroring ensureLoyaltyDefaultsSeeded's gate-on-timestamp pattern (see
 * lib/db/queries/loyalty.ts) - gated on stores.permission_groups_seeded_at
 * rather than "zero groups exist right now", so a store that deliberately
 * deletes a custom group (or, in principle, all groups) never gets
 * silently reseeded.
 */
export async function ensurePermissionGroupsSeeded(): Promise<void> {
  const storeId = getActiveStoreId();
  if (!storeId) return;

  await transaction(async () => {
    const stores = await query<{ id: string; permission_groups_seeded_at: string | null }>(
      "SELECT id, permission_groups_seeded_at FROM stores WHERE id = ?",
      [storeId],
    );
    if (stores.length === 0 || stores[0].permission_groups_seeded_at) return;

    const labels: Record<keyof typeof DEFAULT_GROUP_PERMISSIONS, string> = {
      admin: "Admin",
      manager: "Manager",
      specialist: "Specialist",
      sales_staff: "Sales Staff",
      auditor: "Auditor",
    };

    for (const role of Object.keys(DEFAULT_GROUP_PERMISSIONS) as (keyof typeof DEFAULT_GROUP_PERMISSIONS)[]) {
      await insert("permission_groups", {
        id: generateId(),
        store_id: storeId,
        name: labels[role],
        based_on_role: role,
        is_default: 1,
        permissions: JSON.stringify(DEFAULT_GROUP_PERMISSIONS[role]),
      });
    }

    await update("stores", storeId, {
      permission_groups_seeded_at: new Date().toISOString(),
    });
  });
}

export async function getUserPermissionGroup(
  userId: string,
): Promise<{ id: string; permissions: string[] } | null> {
  const rows = await query<{ id: string; permissions: string }>(
    `SELECT pg.id, pg.permissions FROM permission_groups pg
     JOIN users u ON u.permission_group_id = pg.id
     WHERE u.id = ? AND (pg._deleted = 0 OR pg._deleted IS NULL)`,
    [userId],
  );
  if (rows.length === 0) return null;
  try {
    return { id: rows[0].id, permissions: JSON.parse(rows[0].permissions) };
  } catch {
    return null;
  }
}

/** Every group belonging to the active store - powers the Roles &
 * Permissions matrix UI (Task 9). */
export async function getStorePermissionGroups() {
  const storeId = getActiveStoreId();
  const rows = await query<{
    id: string; name: string; based_on_role: string; is_default: number; permissions: string;
  }>(
    `SELECT id, name, based_on_role, is_default, permissions FROM permission_groups
     WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
     ORDER BY is_default DESC, name ASC`,
    storeId ? [storeId] : [],
  );
  return rows.map((r) => ({ ...r, permissions: JSON.parse(r.permissions) as string[] }));
}
```

- [ ] **Step 4: Run seeding test to verify it passes**

Run: `cd client && npx vitest run __tests__/permission-groups-seeding.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing hasPermission/useHasPermission test**

```ts
// client/__tests__/use-has-permission.test.ts
import { describe, it, expect } from "vitest";

describe("hasPermission", () => {
  it("grants everything to store_owner and super_admin regardless of group", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    expect(hasPermission({ role: "store_owner" }, null, "factory_reset")).toBe(true);
    expect(hasPermission({ role: "super_admin" }, null, "factory_reset")).toBe(true);
  });

  it("checks the assigned group's permissions array for every other role", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    const group = { permissions: ["process_sales", "manage_customers"] };
    expect(hasPermission({ role: "sales_staff" }, group, "process_sales")).toBe(true);
    expect(hasPermission({ role: "sales_staff" }, group, "factory_reset")).toBe(false);
  });

  it("supports any/all mode for multiple keys", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    const group = { permissions: ["process_sales"] };
    expect(hasPermission({ role: "sales_staff" }, group, ["process_sales", "manage_staff"], "any")).toBe(true);
    expect(hasPermission({ role: "sales_staff" }, group, ["process_sales", "manage_staff"], "all")).toBe(false);
  });

  it("falls back to today's role-string logic when no group is synced yet", async () => {
    const { hasPermission } = await import("@/lib/hooks/use-permissions");
    // Fallback reproduces checkCanProcessSales: manager/specialist/sales_staff/admin/store_owner grant it, auditor doesn't.
    expect(hasPermission({ role: "sales_staff" }, null, "process_sales")).toBe(true);
    expect(hasPermission({ role: "auditor" }, null, "process_sales")).toBe(false);
    // Fallback reproduces checkCanFactoryReset: only admin/store_owner/super_admin.
    expect(hasPermission({ role: "manager" }, null, "factory_reset")).toBe(false);
    expect(hasPermission({ role: "admin" }, null, "factory_reset")).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/use-has-permission.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `hasPermission`/`useHasPermission`**

```ts
// client/lib/hooks/use-permissions.ts
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { getUserPermissionGroup } from "@/lib/db/queries/permission-groups";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";

type MinimalUser = { role: string } | null | undefined;
type MinimalGroup = { permissions: string[] } | null | undefined;

/**
 * Fallback used whenever a user has no synced permission_groups row yet
 * (brand-new device before first sync, or a store that predates this
 * feature) - reproduces today's exact 6-helper behavior by role, so no
 * device is ever fully locked out or wide open during that gap. Once real
 * group data exists locally, hasPermission() uses it instead (see below).
 */
function fallbackPermissions(role: string): string[] {
  const normalized = role.toLowerCase().replace(/[^a-z_]/g, "");
  if (normalized === "store_owner" || normalized === "super_admin" || normalized === "admin") {
    return DEFAULT_GROUP_PERMISSIONS.admin;
  }
  if (normalized === "manager") return DEFAULT_GROUP_PERMISSIONS.manager;
  if (normalized === "specialist") return DEFAULT_GROUP_PERMISSIONS.specialist;
  if (normalized === "sales_staff") return DEFAULT_GROUP_PERMISSIONS.sales_staff;
  if (normalized === "auditor") return DEFAULT_GROUP_PERMISSIONS.auditor;
  return [];
}

/** Pure, usable outside React (sync engine, plain query files) - same
 * shape checkIsAdmin etc. already had. store_owner/super_admin always
 * grant everything, matching today's behavior where the owner can never
 * lock themselves out. */
export function hasPermission(
  user: MinimalUser,
  group: MinimalGroup,
  key: string | string[],
  mode: "any" | "all" = "any",
): boolean {
  if (!user) return false;
  const normalized = user.role.toLowerCase().replace(/[^a-z_]/g, "");
  if (normalized === "store_owner" || normalized === "super_admin") return true;

  const granted = group?.permissions ?? fallbackPermissions(user.role);
  const keys = Array.isArray(key) ? key : [key];
  return mode === "all" ? keys.every((k) => granted.includes(k)) : keys.some((k) => granted.includes(k));
}

/** React hook: resolves the current session's permission group (loaded
 * once per user id) and checks it via hasPermission(). Returns false while
 * loading/logged out, matching how the old precomputed booleans defaulted
 * to false with no user. */
export function useHasPermission(key: string | string[], mode: "any" | "all" = "any"): boolean {
  const { user } = useAuth();
  const [group, setGroup] = useState<{ permissions: string[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setGroup(null);
      return;
    }
    getUserPermissionGroup(user.id).then((g) => {
      if (!cancelled) setGroup(g);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return hasPermission(user, group, key, mode);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/use-has-permission.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Wire seeding into the session lifecycle**

In `client/lib/context/auth-context.tsx`, find the `useEffect` that runs whenever `user` changes (the mount-time localStorage restore, alongside `setUser(parsedUser)`/`setUser(defaultAdmin)` call sites) and add a call to `ensurePermissionGroupsSeeded()` right after a non-null user is established, in a `useEffect` keyed on `user?.id`:

```ts
useEffect(() => {
  if (!user) return;
  void ensurePermissionGroupsSeeded();
}, [user?.id]);
```

Import `ensurePermissionGroupsSeeded` from `@/lib/db/queries/permission-groups` at the top of `auth-context.tsx`. This covers login, restored session, and cross-origin handoff uniformly, since all three end in `setUser(...)`.

- [ ] **Step 10: Run the full existing auth-context test suite to confirm no regression**

Run: `cd client && npx vitest run __tests__/auth-default-admin-bootstrap.test.tsx __tests__/auth-login-pos-cart-clear.test.tsx`
Expected: PASS (no change to existing behavior)

- [ ] **Step 11: Commit**

```bash
cd client && git add lib/db/queries/permission-groups.ts lib/hooks/use-permissions.ts lib/context/auth-context.tsx \
  __tests__/permission-groups-seeding.test.ts __tests__/use-has-permission.test.ts
git commit -m "feat: add permission-group seeding and hasPermission/useHasPermission enforcement"
```

---

## Task 6: Auth-context precomputed booleans become permission-driven

**Files:**
- Modify: `client/lib/context/auth-context.tsx:768-771`
- Test: `client/__tests__/auth-context-permission-booleans.test.ts`

**Interfaces:**
- Consumes: `hasPermission` (Task 5), `getUserPermissionGroup` (Task 5).
- Produces: `isAdmin`, `canManageStockBatch`, `canProcessSales`, `canViewAllActivity` context values now computed from the user's resolved permission group instead of a role-array membership check — no change to their names, types, or the ~70 existing call sites that just consume them as booleans/props.

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/auth-context-permission-booleans.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Confirms the migration is behavior-preserving: an auditor (who is denied
 * process_sales by DEFAULT_GROUP_PERMISSIONS.auditor, same as
 * checkCanProcessSales denied them before) still sees canProcessSales as
 * false once assigned their seeded default group, and a manager (granted
 * it) sees it as true - i.e. the new data-driven path agrees with the old
 * hardcoded arrays for the default groups.
 */
describe("useAuth's permission booleans after the group-based migration", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let container: HTMLDivElement;
  let root: Root;
  let capturedFlags: { isAdmin?: boolean; canProcessSales?: boolean } = {};

  beforeAll(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM stores; DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    core.setActiveStoreId("store1");
    container = document.createElement("div");
    document.body.appendChild(container);
    capturedFlags = {};
  });

  async function renderWithUser(role: string, groupPermissions: string[] | null) {
    const { AuthProvider, useAuth } = await import("@/lib/context/auth-context");
    const userId = "u1";
    db.run(`INSERT INTO users (id, role, first_name, last_name) VALUES (?, ?, 'Test', 'User')`, [userId, role]);
    if (groupPermissions) {
      db.run(
        `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions) VALUES ('pg1', 'store1', 'Test Group', ?, 1, ?)`,
        [role, JSON.stringify(groupPermissions)],
      );
      db.run(`UPDATE users SET permission_group_id = 'pg1' WHERE id = ?`, [userId]);
    }
    localStorage.setItem("dumos_user", JSON.stringify({ id: userId, role, first_name: "Test", last_name: "User", username: "test" }));
    sessionStorage.setItem("dumos_session_authenticated", "1");

    function Probe() {
      const { isAdmin, canProcessSales } = useAuth();
      capturedFlags = { isAdmin, canProcessSales };
      return null;
    }

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(Probe)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it("an auditor with the seeded default group cannot process sales", async () => {
    await renderWithUser("auditor", ["view_reports", "export_reports", "view_all_expenses"]);
    expect(capturedFlags.canProcessSales).toBe(false);
  });

  it("a manager with the seeded default group can process sales but is not isAdmin-tier", async () => {
    await renderWithUser("manager", ["process_sales", "manage_staff"]);
    expect(capturedFlags.canProcessSales).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/auth-context-permission-booleans.test.ts`
Expected: FAIL — booleans still computed from the old role arrays, or a type error if `hasPermission` isn't wired yet.

- [ ] **Step 3: Rewire the booleans**

In `client/lib/context/auth-context.tsx`, add the import:

```ts
import { hasPermission } from "@/lib/hooks/use-permissions";
import { getUserPermissionGroup } from "@/lib/db/queries/permission-groups";
```

Replace lines 768-771:

```ts
// before
const isAdmin = user ? checkIsAdmin(user.role) : false;
const canManageStockBatch = user ? checkCanManageStockBatch(user.role) : false;
const canProcessSales = user ? checkCanProcessSales(user.role) : false;
const canViewAllActivity = user ? checkCanViewAllActivity(user.role) : false;
```

```ts
// after
const [permissionGroup, setPermissionGroup] = useState<{ permissions: string[] } | null>(null);
useEffect(() => {
  let cancelled = false;
  if (!user) {
    setPermissionGroup(null);
    return;
  }
  getUserPermissionGroup(user.id).then((g) => {
    if (!cancelled) setPermissionGroup(g);
  });
  return () => {
    cancelled = true;
  };
}, [user?.id]);

const isAdmin = hasPermission(user, permissionGroup, "manage_staff");
const canManageStockBatch = hasPermission(user, permissionGroup, "manage_products");
const canProcessSales = hasPermission(user, permissionGroup, "process_sales");
const canViewAllActivity = hasPermission(user, permissionGroup, "view_activity_log");
```

Note: `isAdmin` now checks `manage_staff` rather than being a broader "admin-tier" flag, since Task 4's `DEFAULT_GROUP_PERMISSIONS` grants `manage_staff` to exactly the same roles (`admin`/`manager`, plus owner/super_admin's bypass) `checkIsAdmin` granted before - the ~70 existing consumers of the `isAdmin` boolean keep working unchanged because the *result* is unchanged for every default role, only its source is now data-driven.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/auth-context-permission-booleans.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full existing test suite**

Run: `cd client && npx vitest run`
Expected: PASS (all — this is the checkpoint that the ~70 boolean-consuming call sites needed zero code changes)

- [ ] **Step 6: Commit**

```bash
cd client && git add lib/context/auth-context.tsx __tests__/auth-context-permission-booleans.test.ts
git commit -m "feat: compute isAdmin/canManageStockBatch/canProcessSales/canViewAllActivity from permission groups"
```

---

## Task 7: Migrate the remaining direct current-actor call sites

**Files:**
- Modify: `client/components/stock-batch/transfer-stock-dialog.tsx:38`
- Modify: `client/components/pos/pos-transaction-history.tsx:52-53`
- Modify: `client/components/pos/pos-layout-header.tsx:51`
- Modify: `client/components/products/product-details/product-history.tsx:65`
- Modify: `client/components/activity-log/activity-log-page.tsx:36`
- Modify: `client/lib/hooks/use-purchase-orders.ts:25`
- Modify: `client/lib/hooks/use-dashboard-overview.ts:28`
- Modify: `client/lib/hooks/use-finance-data.ts:68`
- Modify: `client/lib/hooks/use-pos-data.ts:14`
- Modify: `client/components/settings/danger-zone/device-danger-zone.tsx:30`
- Modify: `client/components/settings/danger-zone/cloud-danger-zone.tsx:35`
- Test: existing tests for each of the above (run, don't rewrite, unless one asserts on the old function name directly)

**Interfaces:**
- Consumes: `useHasPermission` (Task 5).

These are every remaining call site that calls one of the 6 old helper *functions* directly (not via a context-precomputed boolean) **and** passes the *current* session's own role (`user?.role` from `useAuth()`) — i.e. genuinely gates the acting user's own permissions, unlike the two excluded "other record" sites named in Global Constraints.

- [ ] **Step 1: `transfer-stock-dialog.tsx` (checkIsAdmin → manage_products)**

This gate decides whether the dialog shows a manual destination-store picker (admin-tier) or locks to the active store (everyone else) — the underlying capability is inventory/transfer management.

```ts
// before (line 38)
const isAdmin = checkIsAdmin(user?.role);

// after
const isAdmin = useHasPermission("manage_products");
```
Remove the now-unused `checkIsAdmin` import if nothing else in the file uses it.

- [ ] **Step 2: `pos-transaction-history.tsx` (checkIsAdmin → void_refund_sales; checkCanViewAllActivity → view_activity_log)**

```ts
// before (lines 52-53)
const canReturn = checkIsAdmin(user?.role);
const canViewAllActivity = checkCanViewAllActivity(user?.role);

// after
const canReturn = useHasPermission("void_refund_sales");
const canViewAllActivity = useHasPermission("view_activity_log");
```

- [ ] **Step 3: `pos-layout-header.tsx` (checkCanRequestStockTransfer → request_stock_transfers, gated by the store's own toggle)**

```ts
// before (line 51)
checkCanRequestStockTransfer(user?.role, storeProfile?.staff_can_request_transfers) &&

// after
(useHasPermission("request_stock_transfers") &&
  (useHasPermission("manage_products") || storeProfile?.staff_can_request_transfers === 1)) &&
```
This preserves `checkCanRequestStockTransfer`'s exact original composition (admin-tier always allowed; everyone else needs both the base capability AND the store's opt-in toggle) while routing the two role checks it wrapped through the new system.

- [ ] **Step 4: The 5 `checkCanViewAllActivity(user?.role)` sites → `view_activity_log`**

In each of `product-history.tsx:65`, `activity-log-page.tsx:36`, `use-purchase-orders.ts:25`, `use-dashboard-overview.ts:28`, `use-finance-data.ts:68`, `use-pos-data.ts:14`:

```ts
// before
const canViewAllActivity = checkCanViewAllActivity(user?.role); // (or `canViewAll`/`viewerId` variable names per file)

// after
const canViewAllActivity = useHasPermission("view_activity_log");
```
Keep each file's existing variable name (e.g. `canViewAll`, `viewerId` ternary) — only the right-hand side changes.

- [ ] **Step 5: The 2 `checkCanFactoryReset(user?.role)` sites → `factory_reset`**

In `device-danger-zone.tsx:30` and `cloud-danger-zone.tsx:35`:

```ts
// before
const canFactoryReset = checkCanFactoryReset(user?.role);

// after
const canFactoryReset = useHasPermission("factory_reset");
```

- [ ] **Step 6: Run the existing tests for every touched file's feature area**

Run: `cd client && npx vitest run __tests__/stock-transfers.test.ts __tests__/pos-transaction-history* __tests__/activity-log-store-scoping.test.ts 2>/dev/null; npx vitest run` (the final bare `vitest run` is the authoritative full-suite check; the targeted run first is just for a fast first signal)
Expected: PASS. If any test directly imports and asserts on `checkCanViewAllActivity`/`checkCanFactoryReset`/`checkIsAdmin`/`checkCanRequestStockTransfer` as functions (rather than through a rendered component), leave those tests alone for now — Task 8 addresses them when the old functions are removed.

- [ ] **Step 7: Commit**

```bash
cd client && git add components/stock-batch/transfer-stock-dialog.tsx components/pos/pos-transaction-history.tsx \
  components/pos/pos-layout-header.tsx components/products/product-details/product-history.tsx \
  components/activity-log/activity-log-page.tsx lib/hooks/use-purchase-orders.ts lib/hooks/use-dashboard-overview.ts \
  lib/hooks/use-finance-data.ts lib/hooks/use-pos-data.ts components/settings/danger-zone/device-danger-zone.tsx \
  components/settings/danger-zone/cloud-danger-zone.tsx
git commit -m "feat: migrate remaining direct permission-check call sites to useHasPermission"
```

---

## Task 8: Delete the old helpers' export surface, keep the two non-permission role-string exceptions inline

**Files:**
- Modify: `client/lib/context/auth-context.tsx` (remove `checkCanManageStockBatch`, `checkCanProcessSales`, `checkCanRequestStockTransfer`, `checkCanFactoryReset` exports; keep `checkIsAdmin`/`checkCanViewAllActivity` exports **only** because the two excluded sites below still need a role-string check for a non-permission purpose)
- Modify: `client/components/settings/staff/staff-list.tsx:158,163,319` (no functional change — confirm still compiles against the retained `checkIsAdmin`)
- Modify: `client/lib/db/queries/stock-transfers.ts:277` (no functional change — confirm still compiles against the retained `checkIsAdmin`)
- Test: run the full suite; no new test file (this task is a deletion + compile-time check)

**Interfaces:**
- Produces: `auth-context.tsx` no longer exports `checkCanManageStockBatch`/`checkCanProcessSales`/`checkCanRequestStockTransfer`/`checkCanFactoryReset` at all. `checkIsAdmin` and `checkCanViewAllActivity` remain exported, but their doc comments are updated to state they're a plain role-tier utility for non-permission use only (staff-row badges, historical-record business rules) — not a permission gate, and not to be called from any NEW code (new code uses `useHasPermission`).

- [ ] **Step 1: Confirm no remaining callers of the 4 fully-removed functions**

Run: `cd client && grep -rn "checkCanManageStockBatch\|checkCanProcessSales\|checkCanRequestStockTransfer\|checkCanFactoryReset" --include="*.ts" --include="*.tsx" . | grep -v __tests__`
Expected: zero results outside `auth-context.tsx` itself (Tasks 6-7 already removed every call site). If anything remains, migrate it following Task 7's pattern before proceeding.

- [ ] **Step 2: Remove the 4 functions and their `AuthContextType` fields**

In `client/lib/context/auth-context.tsx`, delete the `export const checkCanManageStockBatch = ...`, `checkCanProcessSales`, `checkCanRequestStockTransfer`, and `checkCanFactoryReset` function definitions. They were never part of `AuthContextType`'s interface (only `isAdmin`/`canManageStockBatch`/`canProcessSales`/`canViewAllActivity` booleans are, and those stay — Task 6 already repointed them). Update the doc comment above the retained `checkIsAdmin`/`checkCanViewAllActivity` to note their narrowed purpose:

```ts
/** Plain role-tier utility, NOT a permission gate - kept only for the two
 * call sites that inspect a role belonging to someone OTHER than the
 * acting user (a staff list row's badge, a stock transfer's original
 * initiator), where "which permission group is this OTHER record's role"
 * doesn't apply. Every current-actor permission check uses
 * useHasPermission()/hasPermission() (lib/hooks/use-permissions.ts)
 * instead - do not call this from new gating code. */
export const checkIsAdmin = (role?: string) => {
  // ...unchanged body...
};
```
(Same comment style above `checkCanViewAllActivity`, adjusted for its own two remaining uses if any exist beyond the ones already migrated in Task 7 — re-run Step 1's grep to confirm `checkCanViewAllActivity` truly has zero remaining direct callers too; if so, remove it as well and skip retaining it.)

- [ ] **Step 3: Run the full test suite**

Run: `cd client && npx vitest run`
Expected: PASS. Any failure here means a call site was missed in Task 7 — go back and migrate it, then re-run this step.

- [ ] **Step 4: Run typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: clean (no output)

- [ ] **Step 5: Commit**

```bash
cd client && git add lib/context/auth-context.tsx
git commit -m "refactor: remove replaced permission helpers from auth-context"
```

---

## Task 9: Roles & Permissions matrix UI

**Files:**
- Create: `client/components/settings/roles-permissions/permission-matrix.tsx`
- Create: `client/components/settings/roles-permissions/group-toolbar.tsx`
- Create: `client/components/settings/roles-permissions/new-group-dialog.tsx`
- Create: `client/lib/hooks/use-permission-groups.ts`
- Modify: `client/app/(dashboard)/settings/[tab]/settings-client.tsx:140-144` (swap `RolesPermissionsPlaceholder` for the new matrix)
- Delete: `client/components/settings/roles-permissions-placeholder.tsx`
- Test: `client/__tests__/permission-matrix.test.tsx`

**Interfaces:**
- Consumes: `getStorePermissionGroups` (Task 5), `PERMISSION_CATALOG` (Task 4), `useHasPermission` (Task 5, gates the whole panel on `manage_roles_permissions`).
- Produces: `usePermissionGroups()` hook (`{ groups, toggle(groupId, key, granted), createGroup(name, basedOnRole), copyGroup(sourceId, name), revertToDefault(groupId), renameGroup(groupId, name), deleteGroup(groupId) }`) that later tasks (10, 11) build on.

- [ ] **Step 1: Write the failing test**

```tsx
// client/__tests__/permission-matrix.test.tsx
import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      { id: "g1", name: "Manager", based_on_role: "manager", is_default: true, permissions: ["process_sales"] },
      { id: "g2", name: "Auditor", based_on_role: "auditor", is_default: true, permissions: ["view_reports"] },
    ],
    toggle: vi.fn(),
    createGroup: vi.fn(),
    copyGroup: vi.fn(),
    revertToDefault: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));

describe("PermissionMatrix", () => {
  it("renders one column per group and checks the cells each group actually grants", async () => {
    const { PermissionMatrix } = await import("@/components/settings/roles-permissions/permission-matrix");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PermissionMatrix));
    });

    expect(container.textContent).toContain("Manager");
    expect(container.textContent).toContain("Auditor");
    expect(container.textContent).toContain("Process Sales");
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);

    act(() => root.unmount());
    container.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/permission-matrix.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `usePermissionGroups`**

```ts
// client/lib/hooks/use-permission-groups.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { insert, update, softDelete, generateId } from "@/lib/db/local-database";
import { getStorePermissionGroups } from "@/lib/db/queries/permission-groups";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";

export interface PermissionGroupRow {
  id: string;
  name: string;
  based_on_role: string;
  is_default: number;
  permissions: string[];
}

export function usePermissionGroups() {
  const [groups, setGroups] = useState<PermissionGroupRow[]>([]);

  const reload = useCallback(async () => {
    const rows = await getStorePermissionGroups();
    setGroups(rows as PermissionGroupRow[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = useCallback(
    async (groupId: string, key: string, granted: boolean) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      const next = granted
        ? Array.from(new Set([...group.permissions, key]))
        : group.permissions.filter((k) => k !== key);
      await update("permission_groups", groupId, { permissions: JSON.stringify(next) });
      await reload();
    },
    [groups, reload],
  );

  const createGroup = useCallback(
    async (name: string, basedOnRole: string) => {
      await insert("permission_groups", {
        id: generateId(),
        name,
        based_on_role: basedOnRole,
        is_default: 0,
        permissions: "[]",
      });
      await reload();
    },
    [reload],
  );

  const copyGroup = useCallback(
    async (sourceId: string, name: string) => {
      const source = groups.find((g) => g.id === sourceId);
      if (!source) return;
      await insert("permission_groups", {
        id: generateId(),
        name,
        based_on_role: source.based_on_role,
        is_default: 0,
        permissions: JSON.stringify(source.permissions),
      });
      await reload();
    },
    [groups, reload],
  );

  const revertToDefault = useCallback(
    async (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group || !group.is_default) return;
      const defaults = DEFAULT_GROUP_PERMISSIONS[group.based_on_role as keyof typeof DEFAULT_GROUP_PERMISSIONS];
      if (!defaults) return;
      await update("permission_groups", groupId, { permissions: JSON.stringify(defaults) });
      await reload();
    },
    [groups, reload],
  );

  const renameGroup = useCallback(
    async (groupId: string, name: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group || group.is_default) return; // defaults are immutable by name - Global Constraints
      await update("permission_groups", groupId, { name });
      await reload();
    },
    [groups, reload],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group || group.is_default) return;
      await softDelete("permission_groups", groupId);
      await reload();
    },
    [groups, reload],
  );

  return { groups, toggle, createGroup, copyGroup, revertToDefault, renameGroup, deleteGroup };
}
```

- [ ] **Step 4: Implement the matrix component**

```tsx
// client/components/settings/roles-permissions/permission-matrix.tsx
"use client";

import { useMemo } from "react";
import { PERMISSION_CATALOG } from "@/lib/constants/permissions";
import { usePermissionGroups } from "@/lib/hooks/use-permission-groups";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { GroupToolbar } from "./group-toolbar";

export function PermissionMatrix() {
  const canManage = useHasPermission("manage_roles_permissions");
  const { groups, toggle, createGroup, copyGroup, revertToDefault, renameGroup, deleteGroup } = usePermissionGroups();

  const categories = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_CATALOG>();
    for (const entry of PERMISSION_CATALOG) {
      if (!map.has(entry.category)) map.set(entry.category, []);
      map.get(entry.category)!.push(entry);
    }
    return Array.from(map.entries());
  }, []);

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">You don't have permission to manage roles & permissions.</p>;
  }

  return (
    <div className="space-y-4">
      <GroupToolbar
        groups={groups}
        onCreateGroup={createGroup}
        onCopyGroup={copyGroup}
        onRevertToDefault={revertToDefault}
        onRenameGroup={renameGroup}
        onDeleteGroup={deleteGroup}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Permission</th>
              {groups.map((g) => (
                <th key={g.id} className="p-2 text-center whitespace-nowrap">
                  {g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(([category, entries]) => (
              <>
                <tr key={category}>
                  <td colSpan={groups.length + 1} className="pt-4 pb-1 font-semibold text-muted-foreground">
                    {category}
                  </td>
                </tr>
                {entries.map((entry) => (
                  <tr key={entry.key} className="border-t">
                    <td className="p-2">{entry.label}</td>
                    {groups.map((g) => (
                      <td key={g.id} className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={g.permissions.includes(entry.key)}
                          onChange={(e) => toggle(g.id, entry.key, e.target.checked)}
                          aria-label={`${entry.label} - ${g.name}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the toolbar and New Group dialog**

```tsx
// client/components/settings/roles-permissions/group-toolbar.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { NewGroupDialog } from "./new-group-dialog";
import type { PermissionGroupRow } from "@/lib/hooks/use-permission-groups";

interface GroupToolbarProps {
  groups: PermissionGroupRow[];
  onCreateGroup: (name: string, basedOnRole: string) => Promise<void>;
  onCopyGroup: (sourceId: string, name: string) => Promise<void>;
  onRevertToDefault: (groupId: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
}

export function GroupToolbar({ groups, onCreateGroup, onCopyGroup, onRevertToDefault }: GroupToolbarProps) {
  const { canCreateCustomPermissionGroups, withRestriction } = useFeatureGate();
  const [dialogMode, setDialogMode] = useState<"new" | "copy" | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={withRestriction(() => setDialogMode("new"), {
          featureAllowed: canCreateCustomPermissionGroups,
          featureKey: "custom_permission_groups",
        })}
      >
        New Group
      </Button>
      <Button
        variant="outline"
        onClick={withRestriction(() => setDialogMode("copy"), {
          featureAllowed: canCreateCustomPermissionGroups,
          featureKey: "custom_permission_groups",
        })}
      >
        Copy Group
      </Button>
      {dialogMode && (
        <NewGroupDialog
          mode={dialogMode}
          groups={groups}
          onClose={() => setDialogMode(null)}
          onCreateGroup={onCreateGroup}
          onCopyGroup={onCopyGroup}
        />
      )}
    </div>
  );
}
```

```tsx
// client/components/settings/roles-permissions/new-group-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STAFF_ROLES } from "@/lib/constants/roles";
import type { PermissionGroupRow } from "@/lib/hooks/use-permission-groups";

interface NewGroupDialogProps {
  mode: "new" | "copy";
  groups: PermissionGroupRow[];
  onClose: () => void;
  onCreateGroup: (name: string, basedOnRole: string) => Promise<void>;
  onCopyGroup: (sourceId: string, name: string) => Promise<void>;
}

export function NewGroupDialog({ mode, groups, onClose, onCreateGroup, onCopyGroup }: NewGroupDialogProps) {
  const [name, setName] = useState("");
  const [basedOnRole, setBasedOnRole] = useState(STAFF_ROLES[1]?.value ?? "manager"); // default: Manager tier
  const [sourceGroupId, setSourceGroupId] = useState(groups[0]?.id ?? "");

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (mode === "new") await onCreateGroup(name.trim(), basedOnRole);
    else if (sourceGroupId) await onCopyGroup(sourceGroupId, name.trim());
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "new" ? "New Group" : "Copy Group"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Group name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Supervisor" />
          </div>
          {mode === "new" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Base privilege tier</label>
              <Select value={basedOnRole} onValueChange={setBasedOnRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Copy permissions from</label>
              <Select value={sourceGroupId} onValueChange={setSourceGroupId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>{mode === "new" ? "Create" : "Copy"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Wire it into Settings and delete the placeholder**

In `client/app/(dashboard)/settings/[tab]/settings-client.tsx`, replace:

```tsx
{s.isAdmin && (
  <TabsContent value="roles">
    <RolesPermissionsPlaceholder />
  </TabsContent>
)}
```

with:

```tsx
{s.isAdmin && (
  <TabsContent value="roles">
    <PermissionMatrix />
  </TabsContent>
)}
```

Update the import at the top of the file from `RolesPermissionsPlaceholder` to `PermissionMatrix` (`@/components/settings/roles-permissions/permission-matrix`). Delete `client/components/settings/roles-permissions-placeholder.tsx`.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/permission-matrix.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd client && git add components/settings/roles-permissions/ lib/hooks/use-permission-groups.ts \
  app/'(dashboard)'/settings/'[tab]'/settings-client.tsx __tests__/permission-matrix.test.tsx
git rm components/settings/roles-permissions-placeholder.tsx
git commit -m "feat: build the Roles & Permissions matrix UI, replacing the placeholder"
```

---

## Task 10: Staff form "Group" dropdown + default-group immutability + custom-group deletion guard

**Files:**
- Modify: `client/components/settings/staff/staff-form-fields.tsx:154-186`
- Test: `client/__tests__/staff-form-group-dropdown.test.tsx`
- Test: `client/__tests__/permission-group-guards.test.ts`

**Interfaces:**
- Consumes: `usePermissionGroups` (Task 9), `getStorePermissionGroups` (Task 5).

- [ ] **Step 1: Write the failing dropdown test**

```tsx
// client/__tests__/staff-form-group-dropdown.test.tsx
import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/hooks/use-permission-groups", () => ({
  usePermissionGroups: () => ({
    groups: [
      { id: "g1", name: "Manager", based_on_role: "manager", is_default: true, permissions: [] },
      { id: "g2", name: "Supervisor", based_on_role: "manager", is_default: false, permissions: [] },
    ],
  }),
}));

describe("Staff form Group dropdown", () => {
  it("lists every store group, default and custom, instead of the fixed STAFF_ROLES list", async () => {
    const { StaffFormFields } = await import("@/components/settings/staff/staff-form-fields");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(StaffFormFields, {
          formData: { role: "g1", permission_group_id: "g1" },
          setFormData: () => {},
        }),
      );
    });

    expect(container.textContent).toContain("Manager");
    expect(container.textContent).toContain("Supervisor");

    act(() => root.unmount());
    container.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/staff-form-group-dropdown.test.tsx`
Expected: FAIL — still renders the fixed `STAFF_ROLES` list, no "Supervisor".

- [ ] **Step 3: Replace the role Select with a group Select**

In `client/components/settings/staff/staff-form-fields.tsx`, replace the `STAFF_ROLES`-driven `<Select>` (around line 154-186) with one driven by `usePermissionGroups()`:

```tsx
// before: import { STAFF_ROLES } from "@/lib/constants/roles";
import { usePermissionGroups } from "@/lib/hooks/use-permission-groups";

// ...inside the component...
const { groups } = usePermissionGroups();

// ...replacing the <Label>/<Select> block...
<Label htmlFor="role">Group</Label>
<Select
  value={formData.permission_group_id ?? ""}
  onValueChange={(groupId) => {
    const group = groups.find((g) => g.id === groupId);
    setFormData((prev) => ({
      ...prev,
      permission_group_id: groupId,
      role: group?.based_on_role ?? prev.role,
    }));
  }}
>
  <SelectTrigger>
    <SelectValue placeholder="Select group" />
  </SelectTrigger>
  <SelectContent>
    {groups.map((g) => (
      <SelectItem key={g.id} value={g.id}>
        {g.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```
`formData`'s type (wherever `StaffCreatePayload`/`StaffUpdatePayload` is defined, `client/lib/types/user.ts`) gains `permission_group_id?: string`, sent alongside `role` on create/update — both fields are written together so `role`'s privilege-hierarchy checks and `permission_group_id`'s permission checks never disagree about which staff member they describe.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/staff-form-group-dropdown.test.tsx`
Expected: PASS

- [ ] **Step 5: Write the failing guards test**

```ts
// client/__tests__/permission-group-guards.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({ get: vi.fn(async () => undefined), set: vi.fn(async () => undefined) }));

describe("permission group guards", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let usePermissionGroupsModule: typeof import("@/lib/hooks/use-permission-groups");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    usePermissionGroupsModule = await import("@/lib/hooks/use-permission-groups");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM stores; DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    core.setActiveStoreId("store1");
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions) VALUES
       ('default1', 'store1', 'Manager', 'manager', 1, '["process_sales"]'),
       ('custom1', 'store1', 'Supervisor', 'manager', 0, '["process_sales","manage_staff"]')`,
    );
  });

  it("revertToDefault restores a default group's original seeded permissions after it was edited", async () => {
    await core.execute(`UPDATE permission_groups SET permissions = '[]' WHERE id = 'default1'`, []);

    // Simulate the hook's revertToDefault logic directly against the DB
    // (the full React-hook test is covered by permission-matrix.test.tsx).
    const { revertGroupToDefault } = usePermissionGroupsModule as any;
    await revertGroupToDefault("default1");

    const rows = await core.query<{ permissions: string }>(`SELECT permissions FROM permission_groups WHERE id = 'default1'`);
    expect(JSON.parse(rows[0].permissions)).toContain("process_sales");
  });

  it("deleting a custom group with an assigned staff member is blocked", async () => {
    db.run(`INSERT INTO users (id, role, permission_group_id) VALUES ('staff1', 'manager', 'custom1')`);

    const { deletePermissionGroup } = usePermissionGroupsModule as any;
    await expect(deletePermissionGroup("custom1")).rejects.toThrow(/staff.*assigned/i);

    const rows = await core.query(`SELECT id FROM permission_groups WHERE id = 'custom1' AND (_deleted = 0 OR _deleted IS NULL)`);
    expect(rows).toHaveLength(1);
  });

  it("deleting a custom group with no assigned staff succeeds", async () => {
    const { deletePermissionGroup } = usePermissionGroupsModule as any;
    await deletePermissionGroup("custom1");

    const rows = await core.query(`SELECT id FROM permission_groups WHERE id = 'custom1' AND (_deleted = 0 OR _deleted IS NULL)`);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/permission-group-guards.test.ts`
Expected: FAIL — `revertGroupToDefault`/`deletePermissionGroup` don't exist as standalone exports yet (Task 9 built them as closures inside the hook).

- [ ] **Step 7: Extract testable standalone guard functions**

In `client/lib/hooks/use-permission-groups.ts`, extract the delete/revert logic the hook's callbacks already wrap into standalone exported functions, and have the hook's `deleteGroup`/`revertToDefault` callbacks call them:

```ts
export async function deletePermissionGroup(groupId: string): Promise<void> {
  const assigned = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM users WHERE permission_group_id = ? AND (is_active = 1)`,
    [groupId],
  );
  if ((assigned[0]?.count ?? 0) > 0) {
    throw new Error("Cannot delete a group with staff assigned - reassign them first.");
  }
  const groups = await getStorePermissionGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group || group.is_default) return; // defaults are never deletable
  await softDelete("permission_groups", groupId);
}

export async function revertGroupToDefault(groupId: string): Promise<void> {
  const groups = await getStorePermissionGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group || !group.is_default) return;
  const defaults = DEFAULT_GROUP_PERMISSIONS[group.based_on_role as keyof typeof DEFAULT_GROUP_PERMISSIONS];
  if (!defaults) return;
  await update("permission_groups", groupId, { permissions: JSON.stringify(defaults) });
}
```

Add the `query` import from `@/lib/db/core` this file needs. Update `usePermissionGroups`'s `deleteGroup`/`revertToDefault` callbacks to call these instead of duplicating the logic inline, then `reload()`.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/permission-group-guards.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
cd client && git add components/settings/staff/staff-form-fields.tsx lib/hooks/use-permission-groups.ts \
  lib/types/user.ts __tests__/staff-form-group-dropdown.test.tsx __tests__/permission-group-guards.test.ts
git commit -m "feat: staff form Group dropdown, default-group immutability, custom-group delete guard"
```

---

## Task 11: Plan gating for custom group creation

**Files:**
- Modify: `client/lib/hooks/use-feature-gate.ts`

**Interfaces:**
- Produces: `canCreateCustomPermissionGroups: boolean` on the `useFeatureGate()` return value, consumed by Task 9's `GroupToolbar`.

`use-feature-gate.ts` has ~15 single-line `getFeature(key, altKey, tierExpr)` flags (`canUseAdvancedReports`, `canUseResellerCommission`, `canAutoLock`, etc.) with no dedicated unit test each — only the handful with real *composed* boolean logic (`isLoyaltyProgramEnabled`, `isMarkupSalesEnabled`, `getDefaultMinimumSyncIntervalMinutes`) are pulled out as standalone pure functions and unit-tested (`__tests__/use-feature-gate-loyalty.test.ts` etc.), since the hook itself needs a `useStore()`/`useSystemConfigStore()` React context to render. `canCreateCustomPermissionGroups` is a plain one-liner exactly like its untested siblings, so it follows that same convention — no new test file, verified instead by Task 9's `permission-matrix.test.tsx` (which exercises `GroupToolbar`'s `withRestriction` wiring) and Task 13's manual smoke test.

- [ ] **Step 1: Add the flag**

In `client/lib/hooks/use-feature-gate.ts`'s returned object (alongside `canUseAdvancedReports`, `canUseResellerCommission`):

```ts
canCreateCustomPermissionGroups: getFeature('custom_permission_groups', 'custom_permission_groups', isPro || isEnterprise),
```

- [ ] **Step 2: Run the full client suite to confirm no regression**

Run: `cd client && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd client && git add lib/hooks/use-feature-gate.ts
git commit -m "feat: gate custom permission group creation behind Pro/Enterprise plan"
```

---

## Task 12: Server-side privilege-escalation guard + `permission_group_id` self-edit exclusion

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/App/SyncController.php` (new `sanitizePermissionGroupSyncPayload()` method + call site in `normalizePushPayload()`; add `permission_group_id` to `USER_SYNC_FORBIDDEN_FIELDS`)
- Test: `laravel-server/tests/Feature/PermissionGroupPrivilegeEscalationTest.php`

**Interfaces:**
- Consumes: `PermissionGroup` (Task 2).

- [ ] **Step 1: Write the failing test**

```php
<?php
// laravel-server/tests/Feature/PermissionGroupPrivilegeEscalationTest.php

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

test('a non-admin cannot push a permission_groups edit granting a permission they do not hold', function () {
    $store = Store::factory()->create();
    $ownGroup = PermissionGroup::create([
        'store_id' => $store->id, 'name' => 'Sales Staff', 'based_on_role' => 'sales_staff',
        'is_default' => true, 'permissions' => ['process_sales'],
    ]);
    $targetGroup = PermissionGroup::create([
        'store_id' => $store->id, 'name' => 'Manager', 'based_on_role' => 'manager',
        'is_default' => true, 'permissions' => ['process_sales'],
    ]);
    $cashier = User::factory()->create(['store_id' => $store->id, 'role' => 'sales_staff', 'permission_group_id' => $ownGroup->id]);
    Sanctum::actingAs($cashier);

    $response = $this->postJson('/api/app/sync/push', [
        'changes' => [[
            'id' => 1,
            'table_name' => 'permission_groups',
            'record_id' => $targetGroup->id,
            'operation' => 'UPDATE',
            'payload' => [
                'id' => $targetGroup->id,
                'permissions' => ['process_sales', 'manage_staff', 'factory_reset'],
            ],
        ]],
    ]);

    $response->assertOk();
    expect($response->json('failed'))->not->toBeEmpty();
    expect($targetGroup->fresh()->permissions)->toBe(['process_sales']); // unchanged
});

test('a user cannot self-assign permission_group_id via their own sync push', function () {
    $store = Store::factory()->create();
    $group = PermissionGroup::create([
        'store_id' => $store->id, 'name' => 'Sales Staff', 'based_on_role' => 'sales_staff',
        'is_default' => true, 'permissions' => ['process_sales'],
    ]);
    $adminGroup = PermissionGroup::create([
        'store_id' => $store->id, 'name' => 'Admin', 'based_on_role' => 'admin',
        'is_default' => true, 'permissions' => ['process_sales', 'manage_staff', 'factory_reset'],
    ]);
    $cashier = User::factory()->create(['store_id' => $store->id, 'role' => 'sales_staff', 'permission_group_id' => $group->id]);
    Sanctum::actingAs($cashier);

    $this->postJson('/api/app/sync/push', [
        'changes' => [[
            'id' => 1,
            'table_name' => 'users',
            'record_id' => $cashier->id,
            'operation' => 'UPDATE',
            'payload' => ['id' => $cashier->id, 'permission_group_id' => $adminGroup->id],
        ]],
    ])->assertOk();

    expect($cashier->fresh()->permission_group_id)->toBe($group->id); // unchanged
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=PermissionGroupPrivilegeEscalationTest`
Expected: FAIL — no guard exists yet, both pushes currently succeed as requested.

- [ ] **Step 3: Add `permission_group_id` to the forbidden self-edit list**

In `SyncController.php`, find `USER_SYNC_FORBIDDEN_FIELDS` (~line 1516) and add `'permission_group_id'` to the array, with a comment matching the existing style:

```php
private const USER_SYNC_FORBIDDEN_FIELDS = [
    'role_id', 'email_verified_at', 'remember_token',
    'referral_code', 'referred_by_id', 'referral_credits',
    'platform_referral_code', 'registered_by_id', 'account_manager_id',
    'deletion_requested_at', 'deletion_reason',
    'setup_reminder_level', 'setup_reminder_last_sent_at',
    // A user's OWN permission_group_id must never be settable via their
    // own sync push - same reasoning as role_id above: it can point at a
    // more powerful group than the sync-security ceiling (USER_SYNC_
    // ASSIGNABLE_ROLES / roleIsAtOrBelowCallerPrivilege) would otherwise
    // ever let them grant themselves. Someone WITH manage_staff can still
    // set it on ANOTHER user's row (this list only governs self-edits -
    // see sanitizeUserSyncPayload's isSelf branch).
    'permission_group_id',
];
```

- [ ] **Step 4: Add the `permission_groups` privilege-escalation guard**

Add a new private method to `SyncController.php` (near `sanitizeUserSyncPayload`):

```php
/**
 * Privilege-limits a client-originated `permission_groups` sync payload:
 * every permission key in the payload must already be one the ACTING
 * user's own effective permission set includes, or the whole push for
 * this change is rejected. Without this, editing a group's checkboxes
 * (Task 9's matrix UI, or a raw sync push bypassing it) could grant that
 * group - and therefore anyone assigned to it - a permission the editor
 * never had themselves. store_owner/admin/super_admin bypass, same as
 * every other ownership check in this controller.
 */
private function sanitizePermissionGroupSyncPayload(array $payload, $currentUser): array
{
    if (!isset($payload['permissions']) || !is_array($payload['permissions'])) {
        return $payload;
    }

    $role = strtolower(preg_replace('/[^a-z_]/i', '', $currentUser->role ?? ''));
    if (in_array($role, ['store_owner', 'admin', 'super_admin'], true)) {
        return $payload;
    }

    $ownGroup = $currentUser->permission_group_id
        ? \App\Models\PermissionGroup::find($currentUser->permission_group_id)
        : null;
    $ownPermissions = $ownGroup->permissions ?? [];

    $disallowed = array_diff($payload['permissions'], $ownPermissions);
    if (!empty($disallowed)) {
        throw new \RuntimeException(
            'Sync push: permission_groups payload attempted to grant a permission the caller does not hold: '
            . implode(', ', $disallowed),
        );
    }

    return $payload;
}
```

Call it from `normalizePushPayload()`, right after the existing `users` sanitizer block:

```php
if ($change['table_name'] === 'permission_groups' && $currentUser && !$isSuperAdmin) {
    $payload = $this->sanitizePermissionGroupSyncPayload($payload, $currentUser);
}
```

Confirm `push()`'s per-change try/catch already turns a thrown `\RuntimeException` here into a `failed[]` entry rather than a 500 (matching how `sanitizeUserSyncPayload`'s own thrown exceptions are handled) — if it doesn't already wrap `normalizePushPayload()`'s call in that per-change savepoint's try/catch, that's a pre-existing structural fact to confirm, not something this task changes.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=PermissionGroupPrivilegeEscalationTest`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full existing sync test suite to confirm no regression**

Run: `cd laravel-server && php artisan test --filter=Sync`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd laravel-server && git add app/Http/Controllers/Api/App/SyncController.php tests/Feature/PermissionGroupPrivilegeEscalationTest.php
git commit -m "feat: prevent privilege escalation via permission_groups sync pushes"
```

---

## Task 13: End-to-end regression pass

**Files:** none created — verification only.

- [ ] **Step 1: Full client suite**

Run: `cd client && npx vitest run`
Expected: PASS (every test from Tasks 1-11, plus the full pre-existing suite)

- [ ] **Step 2: Full client typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: clean

- [ ] **Step 3: Full server suite**

Run: `cd laravel-server && php artisan test`
Expected: PASS

- [ ] **Step 4: Manual smoke test against the dev server**

Run: `cd client && npm run dev`, log in as an existing seeded `manager` account, confirm:
- Settings > Staff > Roles & Permissions shows the 5 default groups with the expected checkboxes already ticked (per `DEFAULT_GROUP_PERMISSIONS`).
- Toggling a checkbox on a non-default-role's own group and reloading shows it persisted.
- Creating a custom group is blocked (or allowed, per the logged-in store's plan tier) matching `canCreateCustomPermissionGroups`.
- The staff create/edit form's "Group" dropdown lists all 5 defaults plus any custom groups, and picking one is reflected on the new staff row.
- Every behavior gated by the old `isAdmin`/`canManageStockBatch`/`canProcessSales`/`canViewAllActivity` booleans (Settings tabs visibility, POS return button, Activity Log scope, stock batch management access) is unchanged from before this feature.

- [ ] **Step 5: Commit (if the smoke test surfaced any fix)**

```bash
git add -A
git commit -m "fix: <describe whatever the smoke test caught, if anything>"
```
