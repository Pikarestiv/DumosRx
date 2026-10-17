import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pushChanges: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { warning: vi.fn() },
}));

const logCrash = vi.fn();
vi.mock("@/lib/utils/error-logger", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  logCrash: (...args: unknown[]) => logCrash(...args),
}));

/**
 * A-273. A rewind re-opens the whole table's window, so a second one in the
 * same batch asks for something the first already asked for while spending
 * another unit of a budget of three. Fifty refusals therefore exhausted the
 * budget inside one batch and `restoreBaseline()` put the watermark back —
 * cancelling the re-pull the first rewind had correctly requested, so the row
 * that genuinely lost its conflict was never re-offered (the A-205 case
 * failing silently). Rationale: client/AGENTS.md, "Pull window rewinds".
 */
describe("a batch of refusals rewinds each table's pull window once", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pushChanges: ReturnType<typeof vi.fn> };
    });

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM customers; DELETE FROM _sync_queue; DELETE FROM _sync_state;`);
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES
         ('products', '2026-10-10T00:00:00Z'), ('customers', '2026-10-10T00:00:00Z')`,
    );
    vi.clearAllMocks();
    logCrash.mockClear();
  });

  const windowState = (table: string) => {
    const [row] = db.exec(
      `SELECT last_synced_at, rewind_count, rewound_from FROM _sync_state WHERE table_name = '${table}'`,
    )[0].values;
    return { lastSyncedAt: row[0], rewindCount: Number(row[1]), rewoundFrom: row[2] };
  };

  function queueProducts(count: number) {
    const failed: { id: number; table_name: string; record_id: string; reason: string }[] = [];
    for (let i = 1; i <= count; i++) {
      db.run(
        `INSERT INTO products (id, name, selling_price, _version, _deleted) VALUES ('p${i}', 'Item ${i}', 100, 1, 0)`,
      );
      db.run(
        `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
         VALUES (${i}, 'products', 'p${i}', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
        [JSON.stringify({ id: `p${i}`, selling_price: 100, _version: 1 })],
      );
      failed.push({ id: i, table_name: "products", record_id: `p${i}`, reason: "version_conflict" });
    }
    return failed;
  }

  it("spends one rewind for fifty refusals on the same table and keeps the re-pull open", async () => {
    const failed = queueProducts(50);
    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 0, failed });

    await pushChanges();

    const products = windowState("products");
    expect(products.rewindCount).toBe(1);
    expect(products.lastSyncedAt).toBeNull();
    expect(products.rewoundFrom).toBe("2026-10-10T00:00:00Z");
    expect(logCrash).not.toHaveBeenCalled();
  });

  /**
   * A-273, the client half. The server accepts a re-sent INSERT without
   * writing, so the row's `updated_at` never moves and no pull can re-offer
   * it — `versions` is the only channel that can tell this device what version
   * it is on. This pins that an accepted row ends up both marked synced AND
   * stamped with the server's version, which is what lets its next genuine
   * edit push at a version the server will accept.
   */
  it("applies the server's version to a row it just marked synced", async () => {
    queueProducts(1);
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [],
      versions: { products: { p1: 9 } },
    });

    await pushChanges();

    const [row] = db.exec(`SELECT _version, _synced FROM products WHERE id = 'p1'`)[0].values;
    expect(Number(row[0])).toBe(9);
    expect(Number(row[1])).toBe(1);
    expect(db.exec(`SELECT id FROM _sync_queue`).length).toBe(0);
  });

  it("still rewinds every distinct table a batch lost a conflict on", async () => {
    const failed = queueProducts(2);
    db.run(
      `INSERT INTO customers (id, first_name, _version, _deleted) VALUES ('c1', 'Ada', 1, 0)`,
    );
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (90, 'customers', 'c1', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
      [JSON.stringify({ id: "c1", first_name: "Ada", _version: 1 })],
    );
    failed.push({ id: 90, table_name: "customers", record_id: "c1", reason: "version_conflict" });

    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 0, failed });

    await pushChanges();

    expect(windowState("products").rewindCount).toBe(1);
    expect(windowState("customers").rewindCount).toBe(1);
    expect(windowState("customers").lastSyncedAt).toBeNull();
  });
});
