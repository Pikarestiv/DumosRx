import { describe, it, expect, beforeAll, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("forceSyncAllData() requeues the services tables", () => {
  let db: Database;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  it("queues every services, sale_services and return_services row", async () => {
    db.run(`
      INSERT INTO services (id, store_id, name, price, is_active, _synced) VALUES ('srv-1', 'store-1', 'Consultation', 1500, 1, 1);
      INSERT INTO sale_services (id, sale_id, service_id, service_name, quantity, unit_price, total_price, _synced)
        VALUES ('ss-1', 'sale-1', 'srv-1', 'Consultation', 1, 1500, 1500, 1);
      INSERT INTO return_services (id, return_id, sale_service_id, quantity, refund_amount, _synced)
        VALUES ('rs-1', 'ret-1', 'ss-1', 1, 1500, 1);
    `);
    const { forceSyncAllData } = await import("@/lib/db/local-database");

    await forceSyncAllData();

    const queued = db.exec(
      `SELECT table_name, record_id FROM _sync_queue WHERE table_name IN ('services', 'sale_services', 'return_services') ORDER BY table_name`,
    )[0]?.values ?? [];
    expect(queued).toEqual([["return_services", "rs-1"], ["sale_services", "ss-1"], ["services", "srv-1"]]);
  });
});
