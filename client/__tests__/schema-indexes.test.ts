import { describe, it, expect, vi, beforeEach } from "vitest";
import initSqlJs from "sql.js";

let storedExport: Uint8Array | undefined;

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => storedExport),
  set: vi.fn(async () => undefined),
}));

/**
 * Guards the local read-path indexes added for audit finding A-6. Two
 * populations have to end up with the same set: a fresh install (SCHEMA_SQL)
 * and a device whose database predates the indexes (runSchemaMigrations).
 * The store_id-scoped ones can only live in the migration step, because
 * store_id is itself migration-added and absent from SCHEMA_SQL's CREATE
 * TABLE bodies — so a fresh install picks those up from the migration pass
 * that runs immediately after the schema, not from the schema itself.
 */
const EXPECTED_INDEXES = [
  "idx_stock_batches_product_id",
  "idx_sale_items_sale_id",
  "idx_returns_sale_id",
  "idx_return_items_product_id",
  "idx_sales_customer_id",
  "idx_sales_created_at",
  "idx_sales_store_id_created_at",
  "idx_stock_movements_product_id",
  "idx_stock_movements_reference_id",
  "idx_stock_movements_store_id_created_at",
  "idx_audit_logs_record_id",
  "idx_audit_logs_store_id_created_at",
  "idx_products_barcode",
  "idx_products_name",
  "idx_products_store_id_barcode",
  "idx_sync_queue_table_name_record_id",
];

function listIndexes(db: { exec: (sql: string) => { values: unknown[][] }[] }): string[] {
  const res = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
  );
  if (!res || res.length === 0) return [];
  return res[0].values.map((row) => String(row[0]));
}

describe("local schema indexes (A-6)", () => {
  // core.ts asks sql.js for `/sql-wasm.wasm` (the browser's public path),
  // which doesn't resolve under vitest; loading it once from node_modules
  // first primes the emscripten module so initDatabase() can reuse it, the
  // same way init-database-migrations.test.ts does.
  beforeEach(async () => {
    vi.resetModules();
    storedExport = undefined;
    window.localStorage.setItem("dumosrx_cleared_legacy_v2", "true");
    await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  });

  it("creates every hot-read-path index on a fresh install", async () => {
    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const indexes = listIndexes(db);
    for (const expected of EXPECTED_INDEXES) {
      expect(indexes).toContain(expected);
    }
  });

  it("adds them to an existing database that predates them", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    // A device on the pre-A-6 schema: same tables, but every A-6 index
    // dropped and store_id not yet migrated onto the store-scoped tables.
    legacyDb.run(SCHEMA_SQL);
    for (const name of EXPECTED_INDEXES) {
      if (name === "idx_stock_batches_product_id") continue;
      legacyDb.run(`DROP INDEX IF EXISTS ${name}`);
    }
    expect(listIndexes(legacyDb).sort()).toEqual(["idx_stock_batches_product_id"]);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const indexes = listIndexes(db);
    for (const expected of EXPECTED_INDEXES) {
      expect(indexes).toContain(expected);
    }
  });

  it("analyzes so the planner has real stats to choose between the new indexes", async () => {
    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const stats = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_stat1'",
    );
    expect(stats.length).toBe(1);
  });

  it("re-analyzes once the store has outgrown the stats the last pass recorded", async () => {
    const { makeSqlJsAdapter, runSchemaMigrations } = await import(
      "@/lib/db/schema-migrations"
    );
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const adapter = makeSqlJsAdapter(db);

    // An install that was ANALYZEd while effectively empty - the fresh-install
    // case - must not keep those stats forever, or the planner is still
    // guessing by the time the store is a year old.
    await runSchemaMigrations(adapter);
    const statsWhenEmpty = db.exec("SELECT stat FROM sqlite_stat1 WHERE tbl = 'sales'");
    expect(statsWhenEmpty.length).toBe(0);

    db.run("BEGIN");
    for (let i = 0; i < 2000; i++) {
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, created_at, _deleted)
         VALUES (?, ?, 1, 1, '2026-01-01T00:00:00.000Z', 0)`,
        [`s${i}`, `TX${i}`],
      );
    }
    db.run("COMMIT");

    await runSchemaMigrations(adapter);
    const statsWhenGrown = db.exec("SELECT stat FROM sqlite_stat1 WHERE tbl = 'sales'");
    expect(statsWhenGrown.length).toBe(1);
    expect(Number(String(statsWhenGrown[0].values[0][0]).split(" ")[0])).toBe(2000);
    db.close();
  });

  it("does not make products.barcode unique - duplicate barcodes stay insertable", async () => {
    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    db.run(
      `INSERT INTO products (id, name, barcode, store_id) VALUES ('p1', 'a', '5060', 's1')`,
    );
    // Same barcode in another store, and a genuine in-store duplicate: both
    // are tolerated today (every lookup is LIMIT 1, dedupe is app-level), so
    // the index must not retroactively enforce a constraint that would make
    // an existing catalog un-migratable.
    expect(() =>
      db.run(
        `INSERT INTO products (id, name, barcode, store_id) VALUES ('p2', 'b', '5060', 's2')`,
      ),
    ).not.toThrow();
    expect(() =>
      db.run(
        `INSERT INTO products (id, name, barcode, store_id) VALUES ('p3', 'c', '5060', 's1')`,
      ),
    ).not.toThrow();
  });

  describe("query plans use the new indexes instead of scanning", () => {
    async function planFor(sql: string): Promise<string> {
      const core = await import("@/lib/db/core");
      const db = await core.initDatabase();
      const res = db.exec(`EXPLAIN QUERY PLAN ${sql}`);
      return res[0].values
        .map((row: unknown[]) => String(row[row.length - 1]))
        .join(" | ");
    }

    it("getRecentSales orders and store-filters sales by index", async () => {
      const plan = await planFor(
        `SELECT s.* FROM sales s WHERE s._deleted = 0 AND s.store_id = 'x'
         ORDER BY s.created_at DESC LIMIT 100`,
      );
      expect(plan).toContain("idx_sales_store_id_created_at");
      expect(plan).not.toContain("SCAN sales");
    });

    it("getRecentSales' per-row sale_items subquery seeks by sale_id", async () => {
      const plan = await planFor(
        `SELECT SUM(quantity) FROM sale_items si WHERE si.sale_id = 'x'`,
      );
      expect(plan).toContain("idx_sale_items_sale_id");
      expect(plan).not.toContain("SCAN sale_items");
    });

    it("getRecentSales'/getCustomers' returns subquery seeks by sale_id", async () => {
      const plan = await planFor(
        `SELECT SUM(r.total_refunded) FROM returns r WHERE r.sale_id = 'x'`,
      );
      expect(plan).toContain("idx_returns_sale_id");
      expect(plan).not.toContain("SCAN returns");
    });

    it("the activity log's audit_logs page uses the store/created_at index", async () => {
      const plan = await planFor(
        `SELECT al.* FROM audit_logs al WHERE al._deleted = 0 AND al.store_id = 'x'
         ORDER BY al.created_at DESC LIMIT 50`,
      );
      expect(plan).toContain("idx_audit_logs_store_id_created_at");
      expect(plan).not.toContain("SCAN audit_logs");
    });

    it("getProductHistory seeks audit_logs by record_id and movements by product_id", async () => {
      const auditPlan = await planFor(
        `SELECT al.* FROM audit_logs al WHERE al.record_id = 'x' ORDER BY al.created_at DESC`,
      );
      expect(auditPlan).toContain("idx_audit_logs_record_id");

      const movementPlan = await planFor(
        `SELECT sm.* FROM stock_movements sm WHERE sm.product_id = 'x' ORDER BY sm.created_at DESC`,
      );
      expect(movementPlan).toContain("idx_stock_movements_product_id");
    });

    it("the product-import barcode lookup seeks instead of scanning the catalog", async () => {
      const plan = await planFor(
        `SELECT id FROM products WHERE barcode = 'x' AND _deleted = 0 AND store_id = 's' LIMIT 1`,
      );
      // Must seek on barcode, not merely on store_id - a single-store device
      // has one store_id for the whole catalog, so a store_id-only seek is a
      // full scan wearing an index's name.
      expect(plan).toContain("barcode=?");
      expect(plan).not.toContain("SCAN products");
    });

    it("the per-pulled-record _sync_queue probe seeks by (table_name, record_id)", async () => {
      const plan = await planFor(
        `SELECT 1 FROM _sync_queue WHERE table_name = 't' AND record_id = 'r' LIMIT 1`,
      );
      expect(plan).toContain("idx_sync_queue_table_name_record_id");
      expect(plan).not.toContain("SCAN _sync_queue");
    });

    it("the boot-time orphan scan's _sync_queue subquery seeks by table_name", async () => {
      const plan = await planFor(
        `SELECT id FROM products
         WHERE (_synced = 0 OR _synced IS NULL)
           AND id NOT IN (SELECT record_id FROM _sync_queue WHERE table_name = 't')`,
      );
      expect(plan).toContain("idx_sync_queue_table_name_record_id");
    });
  });
});
