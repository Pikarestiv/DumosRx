import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Agreement was only ever measured for stock, so every other synced table could diverge on every till and the panel still…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-table-fingerprint-test-ts-L9
describe("buildTableFingerprint", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let mod: typeof import("@/lib/db/sync-engine/table-fingerprint");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    mod = await import("@/lib/db/sync-engine/table-fingerprint");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const { STORE_SCOPED_TABLES } = await import("@/lib/db/schema-migrations");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);

    // runSchemaMigrations() adds store_id to every STORE_SCOPED_TABLES entry
    // on a real device; SCHEMA_SQL alone does not.
    for (const table of STORE_SCOPED_TABLES) {
      try {
        db.run(`ALTER TABLE ${table} ADD COLUMN store_id TEXT`);
      } catch {
        // Already present in the base schema for a handful of tables.
      }
    }
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM products; DELETE FROM categories; DELETE FROM _sync_queue;");
    core.setActiveStoreId("store-1");
    mod.resetTableFingerprintThrottleForTesting();
  });

  const product = (id: string, storeId: string, version: number, deleted = 0) =>
    db.run(
      `INSERT INTO products (id, name, selling_price, store_id, _version, _deleted)
       VALUES ('${id}', '${id}', 1, '${storeId}', ${version}, ${deleted})`,
    );

  const rowFor = (
    report: Awaited<ReturnType<typeof mod.buildTableFingerprint>>,
    table: string,
  ) => report?.tables.find((t) => t.t === table);

  it("reports a row count and version sum per table, counting soft-deleted rows", async () => {
    product("p1", "store-1", 3);
    product("p2", "store-1", 4, 1);

    const report = await mod.buildTableFingerprint("store-1");

    expect(rowFor(report, "products")).toEqual({ t: "products", r: 2, v: 7, p: 0 });
  });

  it("excludes rows belonging to another store", async () => {
    product("p1", "store-1", 2);
    product("p9", "store-2", 5);

    expect(rowFor(await mod.buildTableFingerprint("store-1"), "products")).toEqual({
      t: "products",
      r: 1,
      v: 2,
      p: 0,
    });
  });

  it("covers every store-scoped table, so a table with no instrument cannot exist", async () => {
    const { STORE_SCOPED_TABLES } = await import("@/lib/db/schema-migrations");
    const report = await mod.buildTableFingerprint("store-1");

    const expected = STORE_SCOPED_TABLES.filter(
      (table) => !mod.TABLES_NOT_COMPARED.has(table),
    ).sort();

    expect(report?.tables.map((t) => t.t).sort()).toEqual(expected);
  });

  // The server compares the client's `audit_logs` against a different physical table, so it is not in its allowlist and the …
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-table-fingerprint-test-ts-L89
  it("does not scan audit_logs, whose digest the server discards", async () => {
    const report = await mod.buildTableFingerprint("store-1");

    expect(mod.TABLES_NOT_COMPARED.has("audit_logs")).toBe(true);
    expect(report?.tables.map((t) => t.t)).not.toContain("audit_logs");
  });

  it("carries each table's unpushed queue depth so a mid-sync device is not called diverged", async () => {
    product("p1", "store-1", 1);
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, created_at)
       VALUES ('products', 'p1', 'INSERT', '2026-10-18T00:00:00.000Z'),
              ('products', 'p2', 'INSERT', '2026-10-18T00:00:00.000Z'),
              ('categories', 'c1', 'INSERT', '2026-10-18T00:00:00.000Z')`,
    );

    const report = await mod.buildTableFingerprint("store-1");

    expect(rowFor(report, "products")?.p).toBe(2);
    expect(rowFor(report, "categories")?.p).toBe(1);
    expect(rowFor(report, "customers")?.p).toBe(0);
  });

  it("returns null with no active store", async () => {
    core.setActiveStoreId(null);

    expect(await mod.buildTableFingerprint(null)).toBeNull();
  });

  it("scans at most once per throttle window, so an auto-sync every few minutes is free", async () => {
    product("p1", "store-1", 1);

    expect(await mod.buildTableFingerprint("store-1")).not.toBeNull();
    expect(await mod.buildTableFingerprint("store-1")).toBeNull();
  });
});
