import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// getAllPrescriptionItems() used to select the ENTIRE prescription_items table - a table that grows by a row per dispensed…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-prescription-items-scoping-test-ts-L9
describe("getPrescriptionItemsFor", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getPrescriptionItemsFor: typeof import("@/lib/db/queries/prescriptions").getPrescriptionItemsFor;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ getPrescriptionItemsFor } = await import(
      "@/lib/db/queries/prescriptions"
    ));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import(
      "@/lib/db/schema-migrations"
    );
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM prescription_items;`);
    core.setActiveStoreId(null);
  });

  function seedItem(id: string, prescriptionId: string, deleted = 0) {
    db.run(
      `INSERT INTO prescription_items (id, prescription_id, product_name, quantity, _deleted)
       VALUES (?, ?, 'Panadol', 1, ?)`,
      [id, prescriptionId, deleted],
    );
  }

  it("returns only the items belonging to the requested prescriptions", async () => {
    seedItem("i1", "rx-1");
    seedItem("i2", "rx-2");
    seedItem("i3", "rx-3");

    const items = await getPrescriptionItemsFor(["rx-1", "rx-3"]);
    expect(items.map((i) => i.id).sort()).toEqual(["i1", "i3"]);
  });

  it("reads nothing at all for an empty id list", async () => {
    seedItem("i1", "rx-1");
    const items = await getPrescriptionItemsFor([]);
    expect(items).toEqual([]);
  });

  it("still excludes soft-deleted items", async () => {
    seedItem("i1", "rx-1");
    seedItem("i2", "rx-1", 1);

    const items = await getPrescriptionItemsFor(["rx-1"]);
    expect(items.map((i) => i.id)).toEqual(["i1"]);
  });

  it("handles more ids than a single SQL statement should carry", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 1200; i += 1) {
      ids.push(`rx-${i}`);
      seedItem(`i-${i}`, `rx-${i}`);
    }

    const items = await getPrescriptionItemsFor(ids);
    expect(items).toHaveLength(1200);
  });
});
