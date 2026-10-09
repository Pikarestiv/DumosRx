import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Read-only is enforced at the mutation layer, not by hiding buttons: gating
 * the UI alone is how a "read-only" mode ends up writing through some path
 * nobody remembered. See
 * docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.
 */
const STORE_ID = "store-1";

describe("writes during an admin inspection session", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let helpers: typeof import("@/lib/db/base-helpers");
  let till: typeof import("@/lib/utils/till-inspection");

  const live = (): import("@/lib/utils/till-inspection").TillInspectionSession => ({
    admin: {
      id: "a1",
      first_name: "Ops",
      last_name: "Admin",
      email: "ops@dumosrx.com",
      role: "platform_admin",
    },
    sessionId: "sess-1",
    hardExpiresAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    idleExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    storeId: STORE_ID,
    deviceId: "till-7",
  });

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    helpers = await import("@/lib/db/base-helpers");
    till = await import("@/lib/utils/till-inspection");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    sessionStorage.clear();
    db.run(`DELETE FROM products; DELETE FROM _sync_queue;`);
  });

  it("refuses an insert", async () => {
    till.startTillInspectionSession(live());

    await expect(helpers.insert("products", { name: "paracetamol" })).rejects.toThrow(
      till.READ_ONLY_REFUSAL_MESSAGE,
    );
  });

  it("refuses an update", async () => {
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('p1','panadol',0,'${STORE_ID}')`);
    till.startTillInspectionSession(live());

    await expect(helpers.update("products", "p1", { name: "x" })).rejects.toThrow(
      till.READ_ONLY_REFUSAL_MESSAGE,
    );
  });

  it("refuses a soft delete", async () => {
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('p1','panadol',0,'${STORE_ID}')`);
    till.startTillInspectionSession(live());

    await expect(helpers.softDelete("products", "p1")).rejects.toThrow(
      till.READ_ONLY_REFUSAL_MESSAGE,
    );
  });

  it("refuses a hard delete, which would otherwise destroy data in a read-only session", async () => {
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('p1','panadol',0,'${STORE_ID}')`);
    till.startTillInspectionSession(live());

    await expect(helpers.remove("products", "p1")).rejects.toThrow(
      till.READ_ONLY_REFUSAL_MESSAGE,
    );
  });

  it("queues nothing while refusing", async () => {
    till.startTillInspectionSession(live());

    await helpers.insert("products", { name: "paracetamol" }).catch(() => {});

    const queued = db.exec(`SELECT COUNT(*) FROM _sync_queue`);
    expect(queued[0].values[0][0]).toBe(0);
  });

  it("writes normally once the session has ended", async () => {
    till.startTillInspectionSession(live());
    till.endTillInspectionSession();

    await expect(helpers.insert("products", { name: "paracetamol" })).resolves.toBeTypeOf(
      "string",
    );
  });

  it("writes normally when the session has expired, so a stale entry cannot freeze a till", async () => {
    till.startTillInspectionSession({
      ...live(),
      idleExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    await expect(helpers.insert("products", { name: "paracetamol" })).resolves.toBeTypeOf(
      "string",
    );
  });

  it("does not block the fold, which bypasses update() by design", async () => {
    const { foldStockQuantities } = await import("@/lib/db/sync-engine/stock-integrity");
    till.startTillInspectionSession(live());

    await expect(foldStockQuantities()).resolves.toBeDefined();
  });
});
