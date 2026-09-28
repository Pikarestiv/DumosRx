import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";

const pullChangesApi = vi.fn();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/sync-engine/push", () => ({ pushChanges: vi.fn() }));
vi.mock("@/lib/db/sync-engine/pull", () => ({ pullChanges: vi.fn() }));
vi.mock("@/lib/query-client", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/lib/utils/dev-log", () => ({ devLog: vi.fn() }));
vi.mock("@/lib/utils/error-logger", () => ({ logCrash: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    getSystemConfig: vi.fn(async () => null),
    pullChanges: (...args: unknown[]) => pullChangesApi(...args),
  },
}));

/**
 * syncSubscriptionStatus() is the one sync path that runs even for stores
 * with cloud sync switched off, so it is how a plan downgrade, a suspension
 * or a renewal ever reaches a device. It writes directly into `stores` with
 * a hand-built UPDATE and had no coverage: nothing checked that it only
 * touches the five subscription fields (the rest of `stores` is local
 * settings the server has no business overwriting), that it refuses to
 * insert a store the device doesn't have, or that it stamps the pull cursor.
 */
describe("syncSubscriptionStatus", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let syncSubscriptionStatus: typeof import("@/lib/db/sync-engine").syncSubscriptionStatus;
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ syncSubscriptionStatus } = await import("@/lib/db/sync-engine"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stores; DELETE FROM _sync_state;`);
    db.run(
      `INSERT INTO stores (id, name, subscription_tier, status, suspension_reason, license_token, receipt_footer, auto_sync_interval)
       VALUES ('store-1', 'Local Name', 'free', 'Active', NULL, 'old-token', 'Local footer', 45)`,
    );
    pullChangesApi.mockReset();
    localStorage.setItem("auth_token", "fake-token");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(navigator, "onLine", originalOnLine);
    localStorage.clear();
  });

  function storeRow() {
    const rows = db.exec(
      `SELECT subscription_tier, status, suspension_reason, license_token, name, receipt_footer, auto_sync_interval, _synced FROM stores WHERE id = 'store-1'`,
    );
    return rows[0].values[0];
  }

  it("bails out without calling the server when there is no auth token", async () => {
    localStorage.removeItem("auth_token");
    expect(await syncSubscriptionStatus()).toEqual({ success: false, updated: false });
    expect(pullChangesApi).not.toHaveBeenCalled();
  });

  it("bails out without calling the server while offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(await syncSubscriptionStatus()).toEqual({ success: false, updated: false });
    expect(pullChangesApi).not.toHaveBeenCalled();
  });

  it("asks for the full stores record rather than a timestamp delta", async () => {
    pullChangesApi.mockResolvedValue({ changes: {}, server_timestamp: "T1" });
    await syncSubscriptionStatus();
    expect(pullChangesApi).toHaveBeenCalledWith({ last_synced: { stores: "" } }, false, true);
  });

  it("applies a downgrade and a suspension, leaving local-only settings untouched", async () => {
    pullChangesApi.mockResolvedValue({
      changes: {
        stores: [
          {
            id: "store-1",
            subscription_tier: "free",
            status: "Suspended",
            suspension_reason: "Payment failed",
            license_token: "new-token",
            updated_at: "2026-09-01T00:00:00Z",
            // the server also echoes these; they must NOT be applied
            name: "Server Name",
            receipt_footer: "Server footer",
            auto_sync_interval: 5,
          },
        ],
      },
      server_timestamp: "T2",
    });

    const result = await syncSubscriptionStatus();

    expect(result).toEqual({ success: true, updated: true });
    const [tier, status, reason, token, name, footer, interval, synced] = storeRow();
    expect(tier).toBe("free");
    expect(status).toBe("Suspended");
    expect(reason).toBe("Payment failed");
    expect(token).toBe("new-token");
    expect(name).toBe("Local Name");
    expect(footer).toBe("Local footer");
    expect(interval).toBe(45);
    expect(synced).toBe(1);
  });

  it("stamps the stores pull cursor with the server timestamp", async () => {
    pullChangesApi.mockResolvedValue({
      changes: { stores: [{ id: "store-1", subscription_tier: "pro" }] },
      server_timestamp: "2026-09-28T10:00:00Z",
    });

    await syncSubscriptionStatus();

    const rows = db.exec(
      `SELECT last_synced_at FROM _sync_state WHERE table_name = 'stores'`,
    );
    expect(rows[0].values[0][0]).toBe("2026-09-28T10:00:00Z");
  });

  it("applies each record to its own store rather than bleeding across rows", async () => {
    db.run(
      `INSERT INTO stores (id, name, subscription_tier, status) VALUES ('store-2', 'Branch', 'free', 'Active')`,
    );
    pullChangesApi.mockResolvedValue({
      changes: {
        stores: [
          { id: "store-1", subscription_tier: "pro" },
          { id: "store-2", subscription_tier: "enterprise" },
        ],
      },
      server_timestamp: "T3",
    });

    await syncSubscriptionStatus();

    const rows = db.exec(
      `SELECT id, subscription_tier FROM stores ORDER BY id`,
    );
    expect(rows[0].values).toEqual([
      ["store-1", "pro"],
      ["store-2", "enterprise"],
    ]);
  });

  it("reports nothing updated when the response carries no stores", async () => {
    pullChangesApi.mockResolvedValue({ changes: {}, server_timestamp: "T4" });
    expect(await syncSubscriptionStatus()).toEqual({ success: true, updated: false });
    expect(storeRow()[0]).toBe("free");
  });

  it("reports nothing updated for an empty stores array", async () => {
    pullChangesApi.mockResolvedValue({ changes: { stores: [] }, server_timestamp: "T5" });
    expect(await syncSubscriptionStatus()).toEqual({ success: true, updated: false });
  });

  it("leaves the row alone when the record carries no subscription fields at all", async () => {
    pullChangesApi.mockResolvedValue({
      changes: { stores: [{ id: "store-1", name: "Server Name" }] },
      server_timestamp: "T6",
    });

    await syncSubscriptionStatus();

    expect(storeRow()[4]).toBe("Local Name");
  });

  it("swallows a failing pull instead of throwing at its call sites", async () => {
    pullChangesApi.mockRejectedValue(new Error("network down"));
    expect(await syncSubscriptionStatus()).toEqual({ success: false, updated: false });
    expect(storeRow()[0]).toBe("free");
  });
});
