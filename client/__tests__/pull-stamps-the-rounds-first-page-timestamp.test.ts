import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/utils/error-logger", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  logCrash: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: vi.fn(),
  },
}));

// A-282, the multi-page half.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-stamps-the-rounds-first-page-timestamp-test-ts-L20
describe("pullChanges stamps the window with the round's first page timestamp", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  const FIRST_PAGE_AT = "2026-10-18T12:00:00Z";
  const LAST_PAGE_AT = "2026-10-18T12:04:00Z";

  const makeProduct = (n: number) => ({
    id: `prod-${n}`,
    name: `Product ${n}`,
    selling_price: 100,
    updated_at: "2026-09-01T00:00:00.000000Z",
    _version: 1,
  });

  const stampedWindow = (table: string) => {
    const res = db.exec(
      `SELECT last_synced_at FROM _sync_state WHERE table_name = '${table}'`,
    );
    return res.length ? (res[0].values[0][0] as string | null) : null;
  };

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
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM products;`);
    vi.clearAllMocks();
  });

  it("uses the first page's timestamp, not the page that happened to drain the table", async () => {
    apiClient.pullChanges
      .mockResolvedValueOnce({
        success: true,
        changes: { products: [makeProduct(1)] },
        has_more: { products: true },
        server_timestamp: FIRST_PAGE_AT,
      })
      .mockResolvedValueOnce({
        success: true,
        changes: { products: [makeProduct(2)] },
        has_more: { products: false },
        server_timestamp: LAST_PAGE_AT,
      });

    await pullChanges();

    expect(apiClient.pullChanges).toHaveBeenCalledTimes(2);
    expect(stampedWindow("products")).toBe(FIRST_PAGE_AT);
  });

  it("still stamps a single-page round with that page's timestamp", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { products: [makeProduct(1)] },
      has_more: { products: false },
      server_timestamp: FIRST_PAGE_AT,
    });

    await pullChanges();

    expect(stampedWindow("products")).toBe(FIRST_PAGE_AT);
  });
});
