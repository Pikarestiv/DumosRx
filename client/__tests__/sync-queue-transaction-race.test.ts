import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for the orphaned-remote-row bug found while smoke-
 * testing bulk import: a background auto-sync tick called
 * getPendingSyncItems() with a bare query(), which — on sql.js's single
 * ambient connection — sees a still-open transaction()'s uncommitted writes
 * (same-connection reads-your-own-writes). A sync landing mid-import could
 * therefore push rows to the server that the import's transaction later
 * rolled back (or that never persisted locally because the app closed before
 * COMMIT), leaving the server with products no local device ever kept.
 * getPendingSyncItems() now awaits awaitSettledTransactions() first so it
 * only ever reads state from a settled (committed or rolled-back)
 * transaction.
 */
describe("getPendingSyncItems() vs. an in-flight transaction()", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let getPendingSyncItems: typeof import("@/lib/db/base-helpers").getPendingSyncItems;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert, getPendingSyncItems } = await import("@/lib/db/base-helpers"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
  });

  it("does not resolve until a concurrently-open transaction settles", async () => {
    let releaseImport: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });

    const bulkImport = core.transaction(async () => {
      await insert("products", { id: "p1", name: "PARACETAMOL" });
      // Pause here, still inside the open transaction, so a background sync
      // tick landing right now is the exact race being guarded against.
      await gate;
    });

    // Let the transaction actually reach BEGIN before racing it.
    await new Promise((r) => setTimeout(r, 0));

    let resolved = false;
    const pendingItemsPromise = getPendingSyncItems().then((items) => {
      resolved = true;
      return items;
    });

    // Give getPendingSyncItems() a chance to run; it must still be waiting
    // on the open transaction, not reading the not-yet-committed row.
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe(false);

    releaseImport!();
    await bulkImport;
    const items = await pendingItemsPromise;

    expect(resolved).toBe(true);
    expect(items.some((i) => i.record_id === "p1")).toBe(true);
  });

  it("never returns a row from a transaction that ends up rolling back", async () => {
    let releaseImport: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });

    const bulkImport = core
      .transaction(async () => {
        await insert("products", { id: "p2", name: "IBUPROFEN" });
        await gate;
        throw new Error("simulated crash before commit");
      })
      .catch(() => {
        // Expected — asserted via bulkImport below.
      });

    await new Promise((r) => setTimeout(r, 0));

    const pendingItemsPromise = getPendingSyncItems();

    releaseImport!();
    await bulkImport;
    const items = await pendingItemsPromise;

    // Without the awaitSettledTransactions() guard, this would have seen
    // p2's queued row before the rollback erased it.
    expect(items.some((i) => i.record_id === "p2")).toBe(false);
  });
});
