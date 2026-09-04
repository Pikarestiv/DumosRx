import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for _known-bugs.md #11: update()'s `_version` used to
 * be a purely local edit counter (`current._version + 1` written to both the
 * local row AND the queued sync payload), blind to the server's actual
 * current version. Two devices editing the same row from the same shared,
 * already-synced ancestor would always compute the identical "next" version
 * — guaranteed collision arithmetic, not a rare race — which is exactly how
 * a confirmed, server-committed edit got silently overwritten by a second
 * device's later push with zero error or signal (see the MACA GUMMIES
 * reproduction in docs/features/backup-restore.md).
 *
 * The fix: update() now sends/stores the UNCHANGED current `_version`, never
 * incrementing it locally. The server (SyncController::push) is the sole
 * authority for assigning the new version, on acceptance, and returns it to
 * the client via the push response's `versions` field (see push.ts).
 */
describe("update() preserves the base _version instead of incrementing it locally", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let update: typeof import("@/lib/db/base-helpers").update;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert, update } = await import("@/lib/db/base-helpers"));

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

  it("leaves the local row's _version unchanged after an update()", async () => {
    const id = await insert("products", { name: "Maca Gummies", selling_price: 999 });

    const before = db.exec(`SELECT _version FROM products WHERE id = '${id}'`);
    expect(before[0].values[0][0]).toBe(1); // insert() always starts at 1.

    await update("products", id, { selling_price: 1500 });

    const after = db.exec(`SELECT _version FROM products WHERE id = '${id}'`);
    expect(after[0].values[0][0]).toBe(1); // Still 1 — NOT bumped to 2 locally.
  });

  it("queues the sync payload with the unchanged base _version, not an incremented one", async () => {
    const id = await insert("products", { name: "Maca Gummies", selling_price: 999 });
    db.run(`DELETE FROM _sync_queue`); // Clear the INSERT's own queue entry.

    await update("products", id, { selling_price: 1500 });

    const rows = db.exec(
      `SELECT payload FROM _sync_queue WHERE table_name = 'products' AND operation = 'UPDATE'`,
    );
    expect(rows.length).toBe(1);
    const payload = JSON.parse(rows[0].values[0][0] as string);
    expect(payload._version).toBe(1); // The row's base version, sent as-is.
  });

  it("two independent update()s from the same base version both queue the identical version (the guaranteed-collision shape this bug was filed for)", async () => {
    const id = await insert("products", { name: "Maca Gummies", selling_price: 999 });
    db.run(`DELETE FROM _sync_queue`);

    // Simulates two devices, each independently editing from the same
    // already-synced ancestor row (both start from _version 1 here).
    await update("products", id, { selling_price: 1500 });
    const firstQueued = db.exec(
      `SELECT payload FROM _sync_queue WHERE table_name = 'products' ORDER BY id DESC LIMIT 1`,
    );
    const firstPayload = JSON.parse(firstQueued[0].values[0][0] as string);

    // Reset the local row back to its pre-edit state to simulate "device B"
    // never having pulled device A's change (its local copy is still the
    // original ancestor).
    db.run(`UPDATE products SET _version = 1, selling_price = 999 WHERE id = '${id}'`);
    db.run(`DELETE FROM _sync_queue`);

    await update("products", id, { selling_price: 777 });
    const secondQueued = db.exec(
      `SELECT payload FROM _sync_queue WHERE table_name = 'products' ORDER BY id DESC LIMIT 1`,
    );
    const secondPayload = JSON.parse(secondQueued[0].values[0][0] as string);

    // Both edits carry the SAME base version — this is exactly the shape the
    // server's strict version-equality check (SyncController::push) now
    // needs to detect as a real conflict on the second push, instead of the
    // old `<` check silently falling through to an updated_at comparison.
    expect(firstPayload._version).toBe(1);
    expect(secondPayload._version).toBe(1);
  });
});
