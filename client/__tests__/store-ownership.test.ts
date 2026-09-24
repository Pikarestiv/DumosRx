import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for bug #8 (docs/features/_known-bugs.md): update() and
 * softDelete() in base-helpers.ts used to perform zero store-ownership check,
 * so any store could rename/delete another store's row (or a still-shared
 * legacy NULL-store_id row forever, instead of just claiming it once) via the
 * completely ordinary edit/delete UI. Exercises the three real cases against
 * a real in-memory SQLite instance (sql.js), on the "categories" table (a
 * STORE_SCOPED_TABLES member with a simple shape) via the actual update()/
 * softDelete() exports, not a reimplementation.
 */
describe("update()/softDelete() store-ownership check", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let update: typeof import("@/lib/db/base-helpers").update;
  let softDelete: typeof import("@/lib/db/base-helpers").softDelete;
  let remove: typeof import("@/lib/db/base-helpers").remove;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const baseHelpers = await import("@/lib/db/base-helpers");
    update = baseHelpers.update;
    softDelete = baseHelpers.softDelete;
    remove = baseHelpers.remove;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // store_id is added via core.ts's runtime ALTER TABLE migration, not the
    // base CREATE TABLE statements in SCHEMA_SQL. Replicate it here since
    // __setDatabaseForTesting bypasses initDatabase()'s migration loop.
    db.run(`ALTER TABLE categories ADD COLUMN store_id TEXT;`);
    db.run(`ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1;`);
    db.run(`ALTER TABLE held_transactions ADD COLUMN store_id TEXT;`);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM categories; DELETE FROM held_transactions;`);
    core.setActiveStoreId(null);
  });

  function insertCategory(id: string, name: string, storeId: string | null) {
    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted) VALUES ('${id}', '${name}', ${
        storeId ? `'${storeId}'` : "NULL"
      }, 0)`,
    );
  }

  function readCategory(id: string): { name: string; store_id: string | null; _deleted: number } {
    const res = db.exec(`SELECT name, store_id, _deleted FROM categories WHERE id = '${id}'`);
    const [name, store_id, _deleted] = res[0].values[0];
    return { name: name as string, store_id: store_id as string | null, _deleted: _deleted as number };
  }

  describe("update()", () => {
    it("allows editing your own store's row", async () => {
      insertCategory("c1", "Drugs", "store-a");
      core.setActiveStoreId("store-a");

      await update("categories", "c1", { name: "Medicines" });

      // Names are normalized to lowercase on write (withNormalizedName in
      // base-helpers.ts) regardless of the input casing.
      expect(readCategory("c1").name).toBe("medicines");
    });

    it("allows editing a legacy NULL-store_id row and claims it for the active store", async () => {
      insertCategory("c1", "Legacy", null);
      core.setActiveStoreId("store-a");

      await update("categories", "c1", { name: "Legacy Renamed" });

      const row = readCategory("c1");
      expect(row.name).toBe("legacy renamed");
      expect(row.store_id).toBe("store-a");
    });

    it("rejects editing a different known store's row, and leaves the row unmodified", async () => {
      insertCategory("c1", "Drugs", "store-b");
      core.setActiveStoreId("store-a");

      await expect(update("categories", "c1", { name: "Hijacked" })).rejects.toThrow(
        "Cannot modify a record owned by a different store",
      );

      const row = readCategory("c1");
      expect(row.name).toBe("Drugs");
      expect(row.store_id).toBe("store-b");
    });
  });

  describe("softDelete()", () => {
    it("allows deleting your own store's row", async () => {
      insertCategory("c1", "Drugs", "store-a");
      core.setActiveStoreId("store-a");

      await softDelete("categories", "c1");

      expect(readCategory("c1")._deleted).toBe(1);
    });

    it("allows deleting a legacy NULL-store_id row and claims it for the active store", async () => {
      insertCategory("c1", "Legacy", null);
      core.setActiveStoreId("store-a");

      await softDelete("categories", "c1");

      const row = readCategory("c1");
      expect(row._deleted).toBe(1);
      expect(row.store_id).toBe("store-a");
    });

    it("rejects deleting a different known store's row, and leaves the row unmodified", async () => {
      insertCategory("c1", "Drugs", "store-b");
      core.setActiveStoreId("store-a");

      await expect(softDelete("categories", "c1")).rejects.toThrow(
        "Cannot modify a record owned by a different store",
      );

      const row = readCategory("c1");
      expect(row._deleted).toBe(0);
      expect(row.store_id).toBe("store-b");
    });
  });

  it("fails open (allows the write) when no active store is resolved", async () => {
    insertCategory("c1", "Drugs", "store-b");
    core.setActiveStoreId(null);

    await update("categories", "c1", { name: "Edited With No Active Store" });

    expect(readCategory("c1").name).toBe("edited with no active store");
  });

  /**
   * Regression coverage (docs/KNOWN_BUGS.md/FIXED_BUGS.md): the legacy-row
   * claim used to run as its own bare (non-transactional) statement before
   * the caller's write transaction even started, so a failure between the
   * two committed the claim but lost the actual edit — and left the row
   * permanently claimed by this store even though nothing else about it
   * changed. The claim is now applied as the first statement inside the
   * same transaction() as the real write, so a failure anywhere in that
   * transaction rolls back BOTH together.
   */
  describe("legacy-row claim atomicity", () => {
    it("update(): rolls back the claim too when the write itself fails, leaving the row NULL-store_id and unedited", async () => {
      insertCategory("c1", "Legacy", null);
      core.setActiveStoreId("store-a");

      // "nonexistent_column" isn't a real column on `categories` - the
      // claim UPDATE (setting store_id) would succeed first, then this
      // second UPDATE throws a real SQL error, which must roll back the
      // whole transaction including the already-applied claim. Before the
      // fix, the claim ran as its own bare statement before this
      // transaction even started, so it would have survived this failure
      // and permanently claimed the row with the edit lost.
      await expect(
        update("categories", "c1", { nonexistent_column: "x" } as any),
      ).rejects.toThrow();

      const row = readCategory("c1");
      expect(row.store_id).toBeNull();
      expect(row.name).toBe("Legacy");
    });

    // softDelete() shares the identical transaction()-wrapped
    // claim-then-write pattern exercised above for update() (same code
    // shape, same fix) - not re-tested separately here to avoid a
    // near-duplicate test with no additional coverage value; its own
    // claim-application happy path is already covered above ("allows
    // deleting a legacy NULL-store_id row and claims it for the active
    // store").
  });

  /**
   * Regression coverage (docs/KNOWN_BUGS.md L9 / docs/FIXED_BUGS.md): the
   * legacy-row claim previously ran as a statement whose column
   * (`store_id`) was never part of the sync-queue payload, so the local
   * write committed the claim but the server never learned about it -
   * every other device would still see the row as unclaimed indefinitely.
   * The claim is now folded into the same record/payload the rest of the
   * edit uses, so it reaches the server the same way.
   */
  describe("legacy-row claim reaches the sync queue", () => {
    function latestQueuePayload(table: string, id: string): Record<string, unknown> {
      const res = db.exec(
        `SELECT payload FROM _sync_queue WHERE table_name = '${table}' AND record_id = '${id}' ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      );
      return JSON.parse(res[0].values[0][0] as string);
    }

    it("update(): claimed store_id is included in the queued UPDATE payload", async () => {
      insertCategory("c1", "Legacy", null);
      core.setActiveStoreId("store-a");

      await update("categories", "c1", { name: "Legacy Renamed" });

      expect(latestQueuePayload("categories", "c1").store_id).toBe("store-a");
    });

    it("softDelete(): claimed store_id is included in the queued DELETE payload", async () => {
      insertCategory("c1", "Legacy", null);
      core.setActiveStoreId("store-a");

      await softDelete("categories", "c1");

      expect(latestQueuePayload("categories", "c1").store_id).toBe("store-a");
    });

    it("update(): does NOT add a store_id field to the payload when no claim is needed", async () => {
      insertCategory("c1", "Drugs", "store-a");
      core.setActiveStoreId("store-a");

      await update("categories", "c1", { name: "Renamed" });

      expect(latestQueuePayload("categories", "c1")).not.toHaveProperty("store_id");
    });
  });

  /**
   * options.storeId override (bug #8 fix): lets a caller like
   * stock-transfers.ts's transferStock() write a row in a store other than
   * whatever's globally "active", without ever touching the global resolver
   * (the race the original fix closed - see the fix's commit message).
   */
  describe("options.storeId override", () => {
    it("allows a write to a different store than the global, when the override names that store", async () => {
      insertCategory("c1", "Drugs", "store-b");
      core.setActiveStoreId("store-a"); // global says store-a is active...

      // ...but the override explicitly authorizes writing store-b's row.
      await update(
        "categories",
        "c1",
        { name: "Cross-Store Edit" },
        { storeId: "store-b" },
      );

      expect(readCategory("c1").name).toBe("cross-store edit");
    });

    it("still rejects a write when the override names a different store than the row's own", async () => {
      insertCategory("c1", "Drugs", "store-b");
      core.setActiveStoreId("store-a");

      await expect(
        update(
          "categories",
          "c1",
          { name: "Hijacked" },
          { storeId: "store-c" },
        ),
      ).rejects.toThrow("Cannot modify a record owned by a different store");

      expect(readCategory("c1").name).toBe("Drugs");
    });

    it("claims a legacy NULL-store_id row for the override, not the (different) global", async () => {
      insertCategory("c1", "Legacy", null);
      core.setActiveStoreId("store-a");

      await update(
        "categories",
        "c1",
        { name: "Claimed By Override" },
        { storeId: "store-b" },
      );

      const row = readCategory("c1");
      expect(row.name).toBe("claimed by override");
      expect(row.store_id).toBe("store-b");
    });
  });

  /**
   * Low-severity fix (docs/KNOWN_BUGS.md): logAction() used to read the
   * global active-store resolver directly, regardless of any
   * options.storeId override already passed to update()/insert() for the
   * actual data write — so a cross-store write (e.g. stock-transfers.ts's
   * transferStock(), writing the source store's row while some OTHER store
   * is globally "active") produced a correctly-scoped data row but an
   * audit_logs entry attributed to the wrong store. logAction() now accepts
   * the same override, threaded through from update()/insert()'s options.
   */
  describe("logAction() store attribution", () => {
    function readLatestAuditLogStoreId(): string | null {
      const res = db.exec(
        `SELECT store_id FROM audit_logs ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      );
      return (res[0]?.values[0]?.[0] as string | null) ?? null;
    }

    it("attributes an update()'s audit log entry to options.storeId, not the global active store", async () => {
      insertCategory("c1", "Drugs", "store-b");
      core.setActiveStoreId("store-a"); // globally active store...

      // ...but this write is explicitly authorized/attributed to store-b.
      await update(
        "categories",
        "c1",
        { name: "Cross-Store Edit" },
        { storeId: "store-b" },
      );

      expect(readLatestAuditLogStoreId()).toBe("store-b");
    });

    it("still falls back to the global active store when no override is given", async () => {
      insertCategory("c1", "Drugs", "store-a");
      core.setActiveStoreId("store-a");

      await update("categories", "c1", { name: "Ordinary Edit" });

      expect(readLatestAuditLogStoreId()).toBe("store-a");
    });
  });

  /**
   * remove() (hard delete) — the same ownership check as update()/
   * softDelete(), with one deliberate difference for the legacy-NULL case:
   * a hard delete destroys the row outright, so "claim it, then destroy it"
   * would be a pointless extra write (there's nothing left afterward for
   * the claim to protect). A NULL-store_id row is therefore just deletable
   * directly, with no claim step, rather than claimed-then-deleted.
   *
   * Exercised on "held_transactions" (the table bug #8's fix-round review
   * flagged as actually reachable via remove(), see
   * use-pos-held-transactions.ts / use-sales-data.ts), not "categories"
   * (which the app never hard-deletes), so this test matches a real call
   * site's table shape.
   */
  function insertHeldTransaction(id: string, storeId: string | null) {
    db.run(
      `INSERT INTO held_transactions (id, items_json, total_amount, store_id, _deleted) VALUES
        ('${id}', '[]', 100, ${storeId ? `'${storeId}'` : "NULL"}, 0)`,
    );
  }

  function heldTransactionExists(id: string): boolean {
    const res = db.exec(`SELECT id FROM held_transactions WHERE id = '${id}'`);
    return !!res[0]?.values.length;
  }

  function heldTransactionStoreId(id: string): string | null {
    const res = db.exec(`SELECT store_id FROM held_transactions WHERE id = '${id}'`);
    return (res[0]?.values[0]?.[0] as string | null) ?? null;
  }

  describe("remove()", () => {
    it("allows deleting your own store's row", async () => {
      insertHeldTransaction("h1", "store-a");
      core.setActiveStoreId("store-a");

      await remove("held_transactions", "h1");

      expect(heldTransactionExists("h1")).toBe(false);
    });

    it("allows deleting a legacy NULL-store_id row outright, with no claim step", async () => {
      insertHeldTransaction("h1", null);
      core.setActiveStoreId("store-a");

      await remove("held_transactions", "h1");

      expect(heldTransactionExists("h1")).toBe(false);
    });

    it("rejects deleting a different known store's row, and leaves the row unmodified", async () => {
      insertHeldTransaction("h1", "store-b");
      core.setActiveStoreId("store-a");

      await expect(remove("held_transactions", "h1")).rejects.toThrow(
        "Cannot modify a record owned by a different store",
      );

      expect(heldTransactionExists("h1")).toBe(true);
      expect(heldTransactionStoreId("h1")).toBe("store-b");
    });

    it("fails open (allows the delete) when no active store is resolved", async () => {
      insertHeldTransaction("h1", "store-b");
      core.setActiveStoreId(null);

      await remove("held_transactions", "h1");

      expect(heldTransactionExists("h1")).toBe(false);
    });
  });
});
