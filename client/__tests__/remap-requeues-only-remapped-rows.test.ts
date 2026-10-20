import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// A-295's driver. `remapForeignKey()` flips the FK of the rows it remaps and then has to backfill their queue entries, bec…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-remap-requeues-only-remapped-rows-test-ts-L9
describe("remapForeignKey only requeues the rows whose foreign key it changed", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM _sync_queue;`);
  });

  function seedProduct(id: string, categoryId: string | null) {
    db.run(
      `INSERT INTO products (id, name, category_id, selling_price, _synced, _deleted)
       VALUES (?, ?, ?, 100, 0, 0)`,
      [id, `Product ${id}`, categoryId],
    );
  }

  function queuedRecordIds(): string[] {
    const rows = db.exec(`SELECT record_id FROM _sync_queue ORDER BY record_id`);
    return rows.length === 0 ? [] : rows[0].values.map((v) => String(v[0]));
  }

  it("queues the remapped product and leaves an unrelated unsynced product alone", async () => {
    seedProduct("p-remapped", "cat-loser");
    seedProduct("p-untouched", "cat-other");
    const { remapForeignKey } = await import("@/lib/db/reconcile-identity");

    await remapForeignKey(
      "cat-loser",
      "cat-winner",
      [{ table: "products", column: "category_id" }],
      null,
    );

    expect(queuedRecordIds()).toEqual(["p-remapped"]);
    const remapped = db.exec(`SELECT category_id FROM products WHERE id = 'p-remapped'`);
    expect(remapped[0].values[0][0]).toBe("cat-winner");
  });

  it("queues nothing at all when no row referenced the old id", async () => {
    seedProduct("p-untouched", "cat-other");
    const { remapForeignKey } = await import("@/lib/db/reconcile-identity");

    await remapForeignKey(
      "cat-loser",
      "cat-winner",
      [{ table: "products", column: "category_id" }],
      null,
    );

    expect(queuedRecordIds()).toEqual([]);
  });
});
