import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import {
  DEFAULT_GROUP_PERMISSIONS,
  DEFAULT_GROUP_PERMISSION_ADDITIONS,
  PERMISSION_CATALOG_VERSION,
  type DefaultGroupRole,
} from "@/lib/constants/permissions";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// The exact lists the permission-groups feature shipped with on 2026-09-27
// (a5f40463) - what an already-seeded store like the live production one is
// still carrying, and what the Laravel seeder went on seeding new stores
// with for two more days.
const V1_DEFAULTS: Record<DefaultGroupRole, string[]> = {
  admin: [
    "process_sales", "apply_discounts", "void_refund_sales", "open_cash_drawer", "override_price",
    "manage_products", "manage_stock_batches", "adjust_stock_counts", "manage_purchase_orders",
    "receive_purchase_orders", "manage_suppliers", "request_stock_transfers", "approve_stock_transfers",
    "dispense_prescriptions", "manage_prescriptions", "manage_customers", "manage_loyalty",
    "view_reports", "export_reports", "view_activity_log", "record_expenses", "view_all_expenses",
    "manage_staff", "manage_roles_permissions", "manage_store_settings", "manage_payment_accounts",
    "manage_online_store", "manage_billing", "backup_restore_data", "factory_reset",
  ],
  manager: [
    "process_sales", "apply_discounts", "void_refund_sales", "open_cash_drawer", "override_price",
    "manage_products", "manage_stock_batches", "adjust_stock_counts", "manage_purchase_orders",
    "receive_purchase_orders", "manage_suppliers", "request_stock_transfers", "approve_stock_transfers",
    "dispense_prescriptions", "manage_prescriptions", "manage_customers", "manage_loyalty",
    "view_reports", "export_reports", "record_expenses", "view_all_expenses", "manage_staff",
    "manage_store_settings", "manage_payment_accounts", "manage_online_store", "backup_restore_data",
  ],
  specialist: [
    "process_sales", "manage_products", "manage_stock_batches", "adjust_stock_counts",
    "manage_purchase_orders", "receive_purchase_orders", "manage_suppliers",
    "request_stock_transfers", "dispense_prescriptions", "manage_prescriptions",
    "manage_customers", "record_expenses",
  ],
  sales_staff: ["process_sales", "manage_customers", "record_expenses"],
  auditor: ["view_reports", "export_reports", "view_all_expenses"],
};

const ROLES = Object.keys(V1_DEFAULTS) as DefaultGroupRole[];

describe("backfillDefaultGroupPermissions", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let queries: typeof import("@/lib/db/queries/permission-groups");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    queries = await import("@/lib/db/queries/permission-groups");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM stores; DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    core.setActiveStoreId("store1");
  });

  /** A store seeded before the catalog grew: groups exist, the seeded-at
   * stamp is set, and there is no catalog-version stamp at all. */
  function seedPreExpansionStore(overrides: Partial<Record<DefaultGroupRole, string[]>> = {}) {
    db.run(`INSERT INTO stores (id, permission_groups_seeded_at) VALUES ('store1', '2026-09-27T00:00:00.000Z')`);
    for (const role of ROLES) {
      db.run(
        `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions, _version)
         VALUES (?, 'store1', ?, ?, 1, ?, 3)`,
        [`pg-${role}`, role, role, JSON.stringify(overrides[role] ?? V1_DEFAULTS[role])],
      );
    }
  }

  async function permissionsOf(groupId: string): Promise<string[]> {
    const rows = await core.query<{ permissions: string }>(
      `SELECT permissions FROM permission_groups WHERE id = ?`,
      [groupId],
    );
    return JSON.parse(rows[0].permissions);
  }

  async function catalogVersion(): Promise<number | null> {
    const rows = await core.query<{ permission_catalog_version: number | null }>(
      `SELECT permission_catalog_version FROM stores WHERE id = 'store1'`,
    );
    return rows[0].permission_catalog_version;
  }

  it("brings an already-seeded pre-expansion store's default groups up to the current defaults", async () => {
    seedPreExpansionStore();

    await queries.backfillDefaultGroupPermissions();

    for (const role of ROLES) {
      const granted = await permissionsOf(`pg-${role}`);
      for (const key of DEFAULT_GROUP_PERMISSIONS[role]) {
        expect(granted, `${role} should have gained ${key}`).toContain(key);
      }
    }
  });

  // The regression this whole mechanism exists to prevent: a cashier on an
  // already-seeded store losing Hold Sale/Recall, the Recent Sales tab,
  // receipt reprinting, the reseller price override and the customer
  // balance block (which carries "Record Payment") the moment enforcement
  // landed.
  it("restores the exact cashier keys the enforcement pass chose behaviour-preserving defaults for", async () => {
    seedPreExpansionStore();

    await queries.backfillDefaultGroupPermissions();

    expect(await permissionsOf("pg-sales_staff")).toEqual(
      expect.arrayContaining([
        "hold_sales", "view_sales_history", "reprint_receipt",
        "override_price", "view_customer_balances",
      ]),
    );
  });

  it("never removes a key the store already had, including retired ones", async () => {
    seedPreExpansionStore();

    await queries.backfillDefaultGroupPermissions();

    const granted = await permissionsOf("pg-admin");
    expect(granted).toContain("open_cash_drawer");
    expect(granted).toContain("manage_stock_batches");
  });

  it("leaves a custom (non-default) group completely untouched", async () => {
    seedPreExpansionStore();
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions, _version)
       VALUES ('pg-custom', 'store1', 'Supervisor', 'manager', 0, '["process_sales"]', 1)`,
    );

    await queries.backfillDefaultGroupPermissions();

    expect(await permissionsOf("pg-custom")).toEqual(["process_sales"]);
  });

  // is_default stays 1 for the lifetime of a default group - toggling a
  // checkbox does NOT clear it - so what protects an owner's deliberate
  // untick is the version delta, not the flag: only keys added SINCE the
  // store's stamp are unioned in.
  it("does not restore a key the owner unticked that is outside the version delta", async () => {
    const trimmedManager = V1_DEFAULTS.manager.filter((k) => k !== "manage_loyalty");
    seedPreExpansionStore({ manager: trimmedManager });

    await queries.backfillDefaultGroupPermissions();

    expect(await permissionsOf("pg-manager")).not.toContain("manage_loyalty");
  });

  it("is idempotent: a second run changes nothing and duplicates no key", async () => {
    seedPreExpansionStore();

    await queries.backfillDefaultGroupPermissions();
    const afterFirst = await Promise.all(ROLES.map((r) => permissionsOf(`pg-${r}`)));
    await core.execute(`DELETE FROM _sync_queue`, []);

    await queries.backfillDefaultGroupPermissions();
    const afterSecond = await Promise.all(ROLES.map((r) => permissionsOf(`pg-${r}`)));

    expect(afterSecond).toEqual(afterFirst);
    for (const granted of afterSecond) {
      expect(new Set(granted).size).toBe(granted.length);
    }
    const queued = await core.query(`SELECT id FROM _sync_queue`);
    expect(queued).toHaveLength(0);
  });

  it("stamps the current catalog version so the delta is never applied twice", async () => {
    seedPreExpansionStore();

    await queries.backfillDefaultGroupPermissions();

    expect(await catalogVersion()).toBe(PERMISSION_CATALOG_VERSION);
  });

  it("does nothing at all for a store already stamped at the current version", async () => {
    seedPreExpansionStore();
    db.run(`UPDATE stores SET permission_catalog_version = ${PERMISSION_CATALOG_VERSION} WHERE id = 'store1'`);

    await queries.backfillDefaultGroupPermissions();

    expect(await permissionsOf("pg-sales_staff")).toEqual(V1_DEFAULTS.sales_staff);
  });

  it("stamps a freshly seeded store at the current version, so no backfill ever runs against it", async () => {
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);

    await queries.ensurePermissionGroupsSeeded();

    expect(await catalogVersion()).toBe(PERMISSION_CATALOG_VERSION);
  });

  // Race resolution, half one: a device that pulled another device's (or
  // the server's) already-backfilled rows before running its own backfill
  // must not push anything, or every such device would send a redundant
  // permission_groups UPDATE and the losers would come back as version
  // conflicts.
  it("queues no permission_groups push when the rows already carry the whole delta", async () => {
    const merged: Partial<Record<DefaultGroupRole, string[]>> = {};
    for (const role of ROLES) {
      merged[role] = Array.from(
        new Set([...V1_DEFAULTS[role], ...DEFAULT_GROUP_PERMISSION_ADDITIONS[2][role]]),
      );
    }
    seedPreExpansionStore(merged);

    await queries.backfillDefaultGroupPermissions();

    const queued = await core.query<{ table_name: string }>(`SELECT table_name FROM _sync_queue`);
    expect(queued.map((q) => q.table_name)).not.toContain("permission_groups");
  });

  // Race resolution, half two: the store-level stamp is what tells the
  // OTHER side "this delta is already applied", so it must never reach the
  // sync queue ahead of the group rows that make it true.
  it("queues the catalog-version stamp after every permission_groups row it changed", async () => {
    seedPreExpansionStore();

    await queries.backfillDefaultGroupPermissions();

    const queued = await core.query<{ table_name: string; record_id: string }>(
      `SELECT table_name, record_id FROM _sync_queue ORDER BY rowid`,
    );
    const lastGroup = queued.map((q) => q.table_name).lastIndexOf("permission_groups");
    const stamp = queued.findIndex((q) => q.table_name === "stores");
    expect(lastGroup).toBeGreaterThanOrEqual(0);
    expect(stamp).toBeGreaterThan(lastGroup);
  });

  it("converges on the same arrays whichever side applied the delta first", async () => {
    seedPreExpansionStore();
    await queries.backfillDefaultGroupPermissions();
    const clientFirst = await Promise.all(ROLES.map((r) => permissionsOf(`pg-${r}`)));

    db.run(`DELETE FROM permission_groups; DELETE FROM stores; DELETE FROM _sync_queue`);
    const serverApplied: Partial<Record<DefaultGroupRole, string[]>> = {};
    for (const role of ROLES) {
      serverApplied[role] = Array.from(
        new Set([...V1_DEFAULTS[role], ...DEFAULT_GROUP_PERMISSION_ADDITIONS[2][role]]),
      );
    }
    seedPreExpansionStore(serverApplied);
    await queries.backfillDefaultGroupPermissions();
    const serverFirst = await Promise.all(ROLES.map((r) => permissionsOf(`pg-${r}`)));

    expect(serverFirst.map((p) => [...p].sort())).toEqual(clientFirst.map((p) => [...p].sort()));
  });
});
