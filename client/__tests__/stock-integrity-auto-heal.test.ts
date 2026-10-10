import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/utils/error-logger", () => ({
  logCrash: vi.fn(async () => undefined),
}));

/**
 * Auto-heal: the 24-hourly health check folds its own drift back onto the
 * movement log. See docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md
 * §"Phase 3".
 */
describe("healStockIntegrity", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let healStockIntegrity: typeof import("@/lib/db/sync-engine/stock-auto-heal").healStockIntegrity;
  let logCrash: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ healStockIntegrity } = await import("@/lib/db/sync-engine/stock-auto-heal"));
    ({ logCrash } = (await import("@/lib/utils/error-logger")) as unknown as {
      logCrash: ReturnType<typeof vi.fn>;
    });

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // SCHEMA_SQL predates multi-store; schema-migrations.ts adds store_id at
    // runtime, and the heal is store-scoped.
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId("store-1");
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM _pending_stock_deltas;
       DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM products;
       DELETE FROM audit_logs;`,
    );
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('prod-1', 'Pentazocine', 0)`);
    drainedMovementWindow();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  const drainedMovementWindow = () =>
    db.run(
      `INSERT OR REPLACE INTO _sync_state (table_name, last_synced_at, server_cursor)
       VALUES ('stock_movements', '2026-10-10T00:00:00Z', NULL)`,
    );

  const batch = (id: string, quantity: number) =>
    db.run(
      `INSERT INTO stock_batches (id, product_id, store_id, quantity, is_active, _deleted)
       VALUES ('${id}', 'prod-1', 'store-1', ${quantity}, 1, 0)`,
    );

  const movement = (id: string, batchId: string, quantity: number) =>
    db.run(
      `INSERT INTO stock_movements (id, stock_batch_id, product_id, quantity, movement_type, _deleted)
       VALUES ('${id}', '${batchId}', 'prod-1', ${quantity}, '${quantity > 0 ? "purchase" : "sale"}', 0)`,
    );

  const quantityOf = (id: string): number => {
    const rows = db.exec(`SELECT quantity FROM stock_batches WHERE id = '${id}'`);
    return Number(rows[0]?.values?.[0]?.[0] ?? -1);
  };

  const reportContext = (): Record<string, unknown> =>
    (logCrash.mock.calls[0]?.[2] ?? {}) as Record<string, unknown>;

  it("folds a diverged batch back onto its log and reports the outcome", async () => {
    batch("batch-1", 80);
    movement("mv-1", "batch-1", 80);
    movement("mv-2", "batch-1", -28);

    await healStockIntegrity();

    expect(quantityOf("batch-1")).toBe(52);
    expect(logCrash).toHaveBeenCalledTimes(1);
    expect(reportContext()).toMatchObject({
      area: "stock-autoheal",
      folded: 1,
      divergedAfter: 0,
    });
  });

  it("never folds an unreconstructable batch, and still reports it", async () => {
    batch("batch-legacy", 40);

    await healStockIntegrity();

    expect(quantityOf("batch-legacy")).toBe(40);
    expect(reportContext()).toMatchObject({
      area: "stock-autoheal",
      folded: 0,
      unreconstructable: 1,
    });
  });

  it("preserves an A-148 legacy batch's unlogged opening stock once an adjustment is logged against it", async () => {
    batch("batch-legacy", 102);
    movement("mv-1", "batch-legacy", 2);

    await healStockIntegrity();

    expect(quantityOf("batch-legacy")).toBe(102);
    expect(reportContext()).toMatchObject({ folded: 0, unreconstructable: 1 });
  });

  it("leaves a consistent device alone and reports nothing", async () => {
    batch("batch-ok", 52);
    movement("mv-1", "batch-ok", 80);
    movement("mv-2", "batch-ok", -28);

    await healStockIntegrity();

    expect(quantityOf("batch-ok")).toBe(52);
    expect(logCrash).not.toHaveBeenCalled();
  });

  it("refuses to write while the movement log is still mid-window", async () => {
    db.run(
      `UPDATE _sync_state SET last_synced_at = NULL, server_cursor = '{"updated_at":"x","id":"y"}'
        WHERE table_name = 'stock_movements'`,
    );
    batch("batch-1", 80);
    movement("mv-1", "batch-1", 80);
    movement("mv-2", "batch-1", -28);

    await healStockIntegrity();

    expect(quantityOf("batch-1")).toBe(80);
    expect(reportContext()).toMatchObject({ folded: 0, healSkipped: "movement-log-incomplete" });
  });

  it("refuses to write during a read-only on-till inspection session", async () => {
    const { startTillInspectionSession } = await import("@/lib/utils/till-inspection");
    startTillInspectionSession({
      admin: { id: "a1", first_name: "A", last_name: "B", email: "a@b.c", role: "super_admin" },
      sessionId: "s1",
      hardExpiresAt: new Date(Date.now() + 600000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 600000).toISOString(),
      storeId: "store-1",
      deviceId: "dev-1",
    });

    batch("batch-1", 80);
    movement("mv-1", "batch-1", 80);
    movement("mv-2", "batch-1", -28);

    await healStockIntegrity();

    expect(quantityOf("batch-1")).toBe(80);
    expect(reportContext()).toMatchObject({ folded: 0, healSkipped: "inspection-session" });
  });

  it("does not fold a batch whose delta is still queued to apply", async () => {
    batch("batch-1", 80);
    movement("mv-1", "batch-1", 80);
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('mv-2', 'batch-1', -28, 1)`,
    );

    await healStockIntegrity();

    expect(quantityOf("batch-1")).toBe(80);
    expect(logCrash).not.toHaveBeenCalled();
  });

  it("records the heal in the audit log as an automatic repair, not an admin one", async () => {
    batch("batch-1", 80);
    movement("mv-1", "batch-1", 80);
    movement("mv-2", "batch-1", -28);

    await healStockIntegrity();

    const actions = db
      .exec(`SELECT action FROM audit_logs`)[0]
      ?.values.map((row) => String(row[0])) ?? [];
    expect(actions).toContain("AUTO_HEAL_STOCK_QUANTITIES");
    expect(actions).not.toContain("ADMIN_TILL_FOLD_STOCK_QUANTITIES");
  });

  it("flags a heal that did not converge rather than reporting success", async () => {
    batch("batch-1", 80);
    movement("mv-1", "batch-1", 80);
    movement("mv-2", "batch-1", -28);
    db.run(
      `CREATE TRIGGER block_fold BEFORE UPDATE OF quantity ON stock_batches
       BEGIN SELECT RAISE(IGNORE); END;`,
    );

    try {
      await healStockIntegrity();
    } finally {
      db.run(`DROP TRIGGER block_fold`);
    }

    expect(quantityOf("batch-1")).toBe(80);
    expect(reportContext()).toMatchObject({ area: "stock-autoheal", divergedAfter: 1 });
  });
});
