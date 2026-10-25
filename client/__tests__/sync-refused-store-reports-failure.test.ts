import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushChangesMock = vi.fn();
const pullChangesMock = vi.fn();

vi.mock("@/lib/db/sync-engine/push", () => ({
  pushChanges: (...args: unknown[]) => pushChangesMock(...args),
}));
vi.mock("@/lib/db/sync-engine/pull", () => ({
  pullChanges: (...args: unknown[]) => pullChangesMock(...args),
}));
vi.mock("@/lib/query-client", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/lib/db/sync-engine/schema", () => ({
  getValidColumns: vi.fn(() => Promise.resolve(new Set())),
}));
vi.mock("@/lib/db/retention", () => ({
  pruneSyncedAuditLogs: vi.fn(() => Promise.resolve(0)),
}));
vi.mock("@/lib/utils/dev-log", () => ({ devLog: vi.fn() }));
vi.mock("@/lib/utils/error-logger", () => ({ logCrash: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { getSystemConfig: vi.fn(() => Promise.resolve(null)), pullChanges: vi.fn() },
}));

describe("sync() on a round whose active store the server refused (A-323)", () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");
  const refusal = { storeId: "store-b", accessibleStores: [{ id: "store-c", name: "Store C" }] };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("auth_token", "fake-token");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    pushChangesMock.mockReset();
    pullChangesMock.mockReset();
    pushChangesMock.mockResolvedValue({ pushed: 2, failedBatches: 0 });
  });

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(navigator, "onLine", originalOnLine);
    localStorage.clear();
  });

  it("reports the round as failed, names the problem and hands back the stores to switch to", async () => {
    pullChangesMock.mockResolvedValue({ pulled: 1, updatedTables: ["stores"], refusal });
    const { sync } = await import("@/lib/db/sync-engine");
    const { STORE_REFUSED_MESSAGE } = await import("@/lib/db/sync-engine/store-refusal");

    const result = await sync();

    expect(result).toEqual({
      success: false,
      pushed: 2,
      pulled: 1,
      error: STORE_REFUSED_MESSAGE,
      refusal: { ...refusal, reassignedStore: null },
    });
  });

  it("does not record the round as a completed sync, and records why it failed", async () => {
    pullChangesMock.mockResolvedValue({ pulled: 1, updatedTables: ["stores"], refusal });
    const { sync } = await import("@/lib/db/sync-engine");
    const { readSyncOutcome } = await import("@/lib/db/sync-engine/sync-outcome");

    await sync();

    expect(localStorage.getItem("last_sync_time")).toBeNull();
    expect(readSyncOutcome()?.reason).toBe("store_refused");
  });

  it("still succeeds when the pull was not refused", async () => {
    pullChangesMock.mockResolvedValue({ pulled: 0, updatedTables: [] });
    const { sync } = await import("@/lib/db/sync-engine");

    const result = await sync();

    expect(result.success).toBe(true);
    expect(localStorage.getItem("last_sync_time")).not.toBeNull();
  });
});
