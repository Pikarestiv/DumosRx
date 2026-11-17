import { describe, it, expect, vi, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

let db: Database;

const rows = (sql: string): Record<string, unknown>[] => {
  const result = db.exec(sql)[0];
  return result ? result.values.map((v) => Object.fromEntries(result.columns.map((c, i) => [c, v[i]]))) : [];
};

beforeEach(async () => {
  const core = await import("@/lib/db/core");
  const { SCHEMA_SQL } = await import("@/lib/db/schema");
  const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
  db = new SQL.Database();
  db.run(SCHEMA_SQL);
  const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
  await runSchemaMigrations(makeSqlJsAdapter(db));
  core.__setDatabaseForTesting(db);
});

describe("Category rename and delete are queued for sync", () => {
  it("a rename keeps one category and queues an UPDATE for the same id with the new name", async () => {
    const { createCategory, renameCategory, getCategoryList } = await import("@/lib/db/queries/categories");
    const id = await createCategory("Painkillers");

    await renameCategory(id, "Analgesics");

    expect((await getCategoryList()).map((c) => c.name)).toEqual(["analgesics"]);
    const update = rows("SELECT record_id, payload FROM _sync_queue WHERE table_name = 'categories' AND operation = 'UPDATE'");
    expect(update).toHaveLength(1);
    expect(update[0].record_id).toBe(id);
    expect(JSON.parse(String(update[0].payload)).name).toBe("analgesics");
  });

  it("a delete hides the category and queues a DELETE for its id", async () => {
    const { createCategory, deleteCategory, getCategoryList } = await import("@/lib/db/queries/categories");
    const id = await createCategory("Painkillers");

    await deleteCategory(id);

    expect(await getCategoryList()).toEqual([]);
    const deletes = rows("SELECT record_id FROM _sync_queue WHERE table_name = 'categories' AND operation = 'DELETE'");
    expect(deletes.map((d) => d.record_id)).toEqual([id]);
  });
});
