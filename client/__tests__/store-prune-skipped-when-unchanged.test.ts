import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
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

// A-8 (docs/KNOWN_BUGS.md):
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-store-prune-skipped-when-unchanged-test-ts-L15
describe("pull.ts store-reconciliation prune is skipped when nothing could be pruned", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };
  let statements: string[];
  let originalPrepare: Database["prepare"];
  let originalRun: Database["run"];

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
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT;`);
    db.run(`ALTER TABLE sales ADD COLUMN store_id TEXT;`);
    core.__setDatabaseForTesting(db);

    originalPrepare = db.prepare.bind(db) as Database["prepare"];
    originalRun = db.run.bind(db) as Database["run"];
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM stores; DELETE FROM products; DELETE FROM sales; DELETE FROM _sync_state; DELETE FROM _sync_queue;`,
    );
    vi.clearAllMocks();

    statements = [];
    db.prepare = ((sql: string, ...rest: unknown[]) => {
      statements.push(sql);
      return (originalPrepare as (...a: unknown[]) => unknown)(sql, ...rest);
    }) as Database["prepare"];
    db.run = ((sql: string, ...rest: unknown[]) => {
      statements.push(sql);
      return (originalRun as (...a: unknown[]) => unknown)(sql, ...rest);
    }) as Database["run"];
  });

  afterEach(() => {
    db.prepare = originalPrepare;
    db.run = originalRun;
  });

  const prunedStatements = () =>
    statements.filter((s) => s.includes("UPDATE stores SET _deleted = 1"));
  // The prune probes every store-scoped table for a `store_id` column before building its subquery list; `stores` itself is…
  // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-store-prune-skipped-when-unchanged-test-ts-L80
  const scopedColumnProbes = () =>
    statements.filter(
      (s) => s.startsWith("PRAGMA table_info") && !s.includes("(stores)"),
    );

  it("does not run the 26-subquery prune when the server's store set matches the local one", async () => {
    db.run(
      `INSERT INTO stores (id, name, _deleted) VALUES ('store-a', 'Store A', 0), ('store-b', 'Store B', 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [
          { id: "store-a", name: "Store A", _version: 1 },
          { id: "store-b", name: "Store B", _version: 1 },
        ],
      },
      server_timestamp: "2026-09-28T00:00:00Z",
    });

    await pullChanges();

    expect(prunedStatements()).toEqual([]);
    // ...and it must not even pay the per-table `store_id` column probe that
    // builds the prune's subquery list.
    expect(scopedColumnProbes()).toEqual([]);
  });

  it("still runs the prune when the server's snapshot drops a store this device has", async () => {
    db.run(
      `INSERT INTO stores (id, name, _deleted) VALUES ('store-a', 'Store A', 0), ('gone-store', 'Closed Store', 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [{ id: "store-a", name: "Store A", _version: 1 }],
      },
      server_timestamp: "2026-09-28T00:00:00Z",
    });

    await pullChanges();

    expect(prunedStatements().length).toBeGreaterThan(0);
    const rows = db.exec(`SELECT _deleted FROM stores WHERE id = 'gone-store'`);
    expect(rows[0].values[0][0]).toBe(1);
  });

  it("does not run the prune when the only local store missing from the snapshot is already soft-deleted", async () => {
    db.run(
      `INSERT INTO stores (id, name, _deleted) VALUES ('store-a', 'Store A', 0), ('old-store', 'Already Pruned', 1)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [{ id: "store-a", name: "Store A", _version: 1 }],
      },
      server_timestamp: "2026-09-28T00:00:00Z",
    });

    await pullChanges();

    expect(prunedStatements()).toEqual([]);
  });
});
