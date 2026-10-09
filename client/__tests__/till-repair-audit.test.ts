import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * The spec requires every repair run from an inspection session to be audited
 * with the admin, device, store and outcome. logAction attributes user_id to
 * whoever the local DB still points at — the cashier, or nobody — so without
 * these explicit details a repair reads as the staff user's doing.
 */
const STORE_ID = "store-1";

describe("repair auditing", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let till: typeof import("@/lib/utils/till-inspection");
  let fold: typeof import("@/lib/db/sync-engine/stock-integrity").foldStockQuantities;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    till = await import("@/lib/utils/till-inspection");
    ({ foldStockQuantities: fold } = await import("@/lib/db/sync-engine/stock-integrity"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    sessionStorage.clear();
    db.run(
      `DELETE FROM stock_batches; DELETE FROM stock_movements;
       DELETE FROM audit_logs; DELETE FROM _sync_queue;`,
    );
  });

  const startSession = () =>
    till.startTillInspectionSession({
      admin: {
        id: "admin-1",
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

  const divergedBatch = () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted, store_id)
       VALUES ('b1','prod-b1','Opening Stock',10,1,0,'${STORE_ID}')`,
    );
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted, _synced)
       VALUES ('m1','prod-b1','b1','purchase',5,0,1)`,
    );
  };

  const auditRows = () =>
    db.exec(`SELECT action, details FROM audit_logs`)[0]?.values ?? [];

  it("names the admin, not the signed-in staff user, on a fold", async () => {
    startSession();
    divergedBatch();

    await fold();

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("ADMIN_TILL_FOLD_STOCK_QUANTITIES");

    const details = JSON.parse(String(rows[0][1]));
    expect(details.admin_email).toBe("ops@dumosrx.com");
    expect(details.admin_id).toBe("admin-1");
    expect(details.session_id).toBe("sess-1");
    expect(details.device_id).toBe("till-7");
  });

  it("records the outcome, not just that something ran", async () => {
    startSession();
    divergedBatch();

    await fold();

    const details = JSON.parse(String(auditRows()[0][1]));
    expect(details.folded).toBe(1);
    expect(details.units_corrected).toBe(5);
  });

  it("still audits a fold that changed nothing, so a no-op visit is on record", async () => {
    startSession();

    await fold();

    expect(auditRows()).toHaveLength(1);
    expect(JSON.parse(String(auditRows()[0][1])).folded).toBe(0);
  });

  it("audits a support-run fold with null admin fields rather than refusing", async () => {
    // The fold is also reachable from the existing impersonation handoff,
    // where there is no inspection session. It must still leave a trail.
    divergedBatch();

    await fold();

    const details = JSON.parse(String(auditRows()[0][1]));
    expect(details.admin_email).toBeNull();
    expect(details.folded).toBe(1);
  });

  it("sets the admin as the row's actor, not just a detail", async () => {
    // user_id is what the Activity Log and the server's activity_logs show.
    // SyncController backfills an empty or unknown id from the sync token's
    // owner, so leaving it unset made the server's record name the STORE
    // OWNER as having run the clock override.
    startSession();
    divergedBatch();

    await fold();

    const rows = db.exec(`SELECT user_id FROM audit_logs`)[0].values;
    expect(rows[0][0]).toBe("admin-1");
  });

  it("queues the pushed row with the admin as actor too", async () => {
    startSession();
    divergedBatch();

    await fold();

    const queued = db.exec(
      `SELECT payload FROM _sync_queue WHERE table_name = 'audit_logs'`,
    )[0].values;
    expect(JSON.parse(String(queued[0][0])).user_id).toBe("admin-1");
  });

  it("falls back to the signed-in local user with no inspection session", async () => {
    // Asserting null here proved nothing: null is what any implementation
    // yields when no current user was ever set. Set one, so the fallback is
    // what the assertion actually measures.
    core.setCurrentUser({
      id: "cashier-1",
      first_name: "Ada",
      last_name: "Cashier",
      role: "sales_staff",
    });
    divergedBatch();

    await fold();

    const rows = db.exec(`SELECT user_id FROM audit_logs`)[0].values;
    expect(rows[0][0]).toBe("cashier-1");

    core.setCurrentUser(null);
  });
});
