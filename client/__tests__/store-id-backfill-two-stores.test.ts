import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// A-248. `backfillStoreIdOnLegacyRows()` stamped every NULL `store_id` with `(SELECT id FROM stores LIMIT 1)` — no ORDER B…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-store-id-backfill-two-stores-test-ts-L9
describe("legacy store_id backfill on a device holding two stores", () => {
  let db: Database;
  let runSchemaMigrations: typeof import("@/lib/db/schema-migrations").runSchemaMigrations;
  let makeSqlJsAdapter: typeof import("@/lib/db/schema-migrations").makeSqlJsAdapter;

  beforeAll(async () => {
    ({ runSchemaMigrations, makeSqlJsAdapter } = await import(
      "@/lib/db/schema-migrations"
    ));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
  });

  beforeEach(() => {
    db.run("DELETE FROM stores; DELETE FROM products;");
  });

  const store = (id: string, name: string) =>
    db.run(`INSERT INTO stores (id, name) VALUES ('${id}', '${name}')`);

  const legacyProduct = (id: string) =>
    db.run(
      `INSERT INTO products (id, name, selling_price) VALUES ('${id}', 'P-${id}', 100)`,
    );

  const storeIdOf = (id: string) => {
    const res = db.exec(`SELECT store_id FROM products WHERE id = '${id}'`);
    return res[0].values[0][0];
  };

  it("claims legacy rows for the only store when there is exactly one", async () => {
    store("only-store", "Solo");
    legacyProduct("p1");

    await runSchemaMigrations(makeSqlJsAdapter(db));

    expect(storeIdOf("p1")).toBe("only-store");
  });

  it("leaves legacy rows alone rather than guessing between two stores", async () => {
    store("store-a", "Amawbia");
    store("store-b", "Agidi");
    legacyProduct("p2");

    await runSchemaMigrations(makeSqlJsAdapter(db));

    expect(storeIdOf("p2")).toBeNull();
  });
});
