import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { QueryObserver } from "@tanstack/react-query";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pushChanges: vi.fn(),
    pullChanges: vi.fn(),
    getSystemConfig: vi.fn(() => Promise.resolve(null)),
  },
}));

vi.mock("@/lib/utils/error-logger", () => ({
  logCrash: vi.fn(() => Promise.resolve()),
  isExpectedPlanRestriction: () => false,
}));

describe("the sync indicator's pending count after a sync drains the queue", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let sync: typeof import("@/lib/db/sync-engine").sync;
  let queryClient: typeof import("@/lib/query-client").queryClient;
  let queryKeys: typeof import("@/lib/query-keys").queryKeys;
  let getSyncQueueCount: typeof import("@/lib/db/queries/setup").getSyncQueueCount;
  let apiClient: Record<"pushChanges" | "pullChanges", ReturnType<typeof vi.fn>>;
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");
  let unsubscribe: () => void = () => {};

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ sync } = await import("@/lib/db/sync-engine"));
    ({ queryClient } = await import("@/lib/query-client"));
    ({ queryKeys } = await import("@/lib/query-keys"));
    ({ getSyncQueueCount } = await import("@/lib/db/queries/setup"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as { apiClient: typeof apiClient });

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM loyalty_tiers; DELETE FROM _sync_queue;`);
    queryClient.clear();
    localStorage.clear();
    localStorage.setItem("auth_token", "fake-token");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    apiClient.pullChanges.mockResolvedValue({ success: true, changes: {}, server_timestamp: "2026-11-14T00:00:00Z", has_more: {} });
  });

  afterEach(() => {
    unsubscribe();
    if (originalOnLine) Object.defineProperty(navigator, "onLine", originalOnLine);
    localStorage.clear();
    vi.clearAllMocks();
  });

  const queueLoyaltyTier = (id: string) => {
    db.run(
      `INSERT INTO loyalty_tiers (id, store_id, name, min_spend, points_multiplier, created_at, updated_at, _synced, _version)
       VALUES ('${id}', 'store-a', 'Gold', 0, 1, '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z', 0, 1)`,
    );
    return db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('loyalty_tiers', '${id}', 'INSERT', '{"id":"${id}","store_id":"store-a"}', '2026-11-14T00:00:00Z') RETURNING id`,
    )[0].values[0][0] as number;
  };

  async function watchPendingCount() {
    const observer = new QueryObserver(queryClient, {
      ...queryKeys.sync.queueCount(),
      queryFn: () => getSyncQueueCount(),
    });
    unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    return observer;
  }

  it("reads zero the moment sync() resolves, not on the next poll", async () => {
    queueLoyaltyTier("4d1c0b8e-6a63-4c7e-9b51-2f0b1c9e7a11");
    const observer = await watchPendingCount();
    expect(observer.getCurrentResult().data).toBe(1);
    apiClient.pushChanges.mockResolvedValue({ success: true, processed: 1, failed: [] });

    const result = await sync();

    expect(result.success).toBe(true);
    expect(db.exec(`SELECT COUNT(*) FROM _sync_queue`)[0].values[0][0]).toBe(0);
    expect(observer.getCurrentResult().data).toBe(0);
  });

  it("still reads the backlog when the push failed and the rows are still queued", async () => {
    queueLoyaltyTier("8f2e6c1a-0b7d-4e3f-a1c2-5d9e8b7a6f43");
    const observer = await watchPendingCount();
    apiClient.pushChanges.mockRejectedValue(new Error("Server unreachable"));

    await sync();

    expect(observer.getCurrentResult().data).toBe(1);
  });
});
