import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: vi.fn(),
  },
}));

// Regression test for a real incident:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-store-prune-safety-test-ts-L15
describe("pull.ts store-reconciliation safety guard", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pullChanges } = await import("@/lib/db/sync-engine/pull"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pullChanges: ReturnType<typeof vi.fn> };
    });

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // store_id is added via core.ts's runtime ALTER TABLE migration, not the base CREATE TABLE statements in SCHEMA_SQL.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-prune-safety-test-ts-L43
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT;`);
    db.run(`ALTER TABLE sales ADD COLUMN store_id TEXT;`);
    // expenses already has store_id in the base SCHEMA_SQL (unlike products/sales, which only get it via core.ts's runtime ALT…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-prune-safety-test-ts-L48
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stores; DELETE FROM products; DELETE FROM sales; DELETE FROM expenses; DELETE FROM _sync_state; DELETE FROM _sync_queue;`);
    vi.clearAllMocks();
  });

  it("never prunes a store that still has products attached, even when the server doesn't return it", async () => {
    db.run(
      `INSERT INTO stores (id, name, _deleted) VALUES ('orphan-store', 'Old Local Store', 0)`,
    );
    db.run(
      `INSERT INTO products (id, name, store_id, _deleted) VALUES ('p1', 'Panadol', 'orphan-store', 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [{ id: "server-store", name: "Real Cloud Store", _version: 1 }],
      },
      server_timestamp: "2026-08-14T00:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(`SELECT _deleted FROM stores WHERE id = 'orphan-store'`);
    expect(rows[0].values[0][0]).toBe(0);
  });

  it("never prunes a store that still has sales attached", async () => {
    db.run(
      `INSERT INTO stores (id, name, _deleted) VALUES ('orphan-store', 'Old Local Store', 0)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, store_id, _deleted)
       VALUES ('s1', 'TXN-1', 1000, 1000, '2026-08-01', 'orphan-store', 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [{ id: "server-store", name: "Real Cloud Store", _version: 1 }],
      },
      server_timestamp: "2026-08-14T00:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(`SELECT _deleted FROM stores WHERE id = 'orphan-store'`);
    expect(rows[0].values[0][0]).toBe(0);
  });

  it("never prunes a store whose only attached data is in a store-scoped table other than products/sales", async () => {
    db.run(
      `INSERT INTO stores (id, name, _deleted) VALUES ('orphan-store', 'Old Local Store', 0)`,
    );
    db.run(
      `INSERT INTO expenses (id, category, amount, date, store_id, _deleted)
       VALUES ('e1', 'Rent', 500, '2026-08-01', 'orphan-store', 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [{ id: "server-store", name: "Real Cloud Store", _version: 1 }],
      },
      server_timestamp: "2026-08-14T00:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(`SELECT _deleted FROM stores WHERE id = 'orphan-store'`);
    expect(rows[0].values[0][0]).toBe(0);
  });

  it("does prune a genuinely empty local store the server doesn't recognize", async () => {
    db.run(
      `INSERT INTO stores (id, name, _deleted) VALUES ('empty-orphan', 'Never Used', 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [{ id: "server-store", name: "Real Cloud Store", _version: 1 }],
      },
      server_timestamp: "2026-08-14T00:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(`SELECT _deleted FROM stores WHERE id = 'empty-orphan'`);
    expect(rows[0].values[0][0]).toBe(1);
  });
});
