import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression coverage for checkSyncHealth() - the periodic check that a
 * device's local row counts actually match the server's, independent of
 * whatever its own pull cursor believes. See health-check.ts's own doc
 * comment for why this exists: a pull cursor can get stuck with no error
 * anywhere to notice it by, and this is what catches that automatically
 * instead of relying on someone manually running SQL against production.
 */

const queryMock = vi.fn();
vi.mock("../lib/db/core", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  isTauri: () => true,
  isWriterTab: () => true,
  getActiveStoreId: () => "store-1",
}));

const getSyncCountsMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { getSyncCounts: (...args: unknown[]) => getSyncCountsMock(...args) },
}));

const logCrashMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/utils/error-logger", () => ({
  logCrash: (...args: unknown[]) => logCrashMock(...args),
}));

vi.mock("@/lib/utils/impersonation", () => ({
  isImpersonatedSession: () => false,
}));

const forceFullResyncMock = vi.fn().mockResolvedValue({ success: true, pushed: 0, pulled: 0 });
vi.mock("../lib/db/sync-engine/index", () => ({
  forceFullResync: (...args: unknown[]) => forceFullResyncMock(...args),
}));

import { checkSyncHealth } from "../lib/db/sync-engine/health-check";

const TABLES = ["products", "stock_batches", "sales", "customers", "categories"];

function mockLocalCounts(counts: Record<string, number>) {
  queryMock.mockImplementation(async (sql: string) => {
    const table = TABLES.find((t) => sql.includes(`FROM ${t} `));
    return [{ count: table ? (counts[table] ?? 0) : 0 }];
  });
}

describe("checkSyncHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("auth_token", "test-token");
    localStorage.setItem("last_sync_time", new Date().toISOString());
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("does nothing when checked within the last 24h", async () => {
    localStorage.setItem("dumos_last_sync_health_check", String(Date.now() - 1000));

    await checkSyncHealth();

    expect(getSyncCountsMock).not.toHaveBeenCalled();
  });

  it("does not resync when local counts are equal to or ahead of the server (normal unsynced local edits)", async () => {
    getSyncCountsMock.mockResolvedValueOnce({
      success: true,
      counts: { products: 10, stock_batches: 20, sales: 5, customers: 3, categories: 2 },
    });
    mockLocalCounts({ products: 12, stock_batches: 20, sales: 5, customers: 3, categories: 2 });

    await checkSyncHealth();

    expect(forceFullResyncMock).not.toHaveBeenCalled();
    expect(logCrashMock).not.toHaveBeenCalled();
  });

  it("triggers forceFullResync and logs to Sentry when local is behind the server", async () => {
    getSyncCountsMock.mockResolvedValueOnce({
      success: true,
      counts: { products: 2705, stock_batches: 4000, sales: 5, customers: 3, categories: 13 },
    });
    mockLocalCounts({ products: 2672, stock_batches: 4000, sales: 5, customers: 3, categories: 13 });

    await checkSyncHealth();

    expect(forceFullResyncMock).toHaveBeenCalledTimes(1);
    expect(logCrashMock).toHaveBeenCalledTimes(1);
    const [, , context] = logCrashMock.mock.calls[0];
    expect(context.area).toBe("sync-health-check");
    expect(context.deficits).toContain("products");
  });

  it("stamps the last-checked timestamp only on a successful fetch, not on failure", async () => {
    getSyncCountsMock.mockRejectedValueOnce(new Error("Network error"));

    await checkSyncHealth();

    expect(localStorage.getItem("dumos_last_sync_health_check")).toBeNull();
  });

  it("does nothing when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    await checkSyncHealth();

    expect(getSyncCountsMock).not.toHaveBeenCalled();
  });

  it("does nothing without an auth token", async () => {
    localStorage.removeItem("auth_token");

    await checkSyncHealth();

    expect(getSyncCountsMock).not.toHaveBeenCalled();
  });

  it("does nothing when this device has never completed a sync round", async () => {
    // A brand-new/still-catching-up device, not a stuck-cursor one; must
    // not be misdiagnosed as one.
    localStorage.removeItem("last_sync_time");

    await checkSyncHealth();

    expect(getSyncCountsMock).not.toHaveBeenCalled();
  });

  describe("backoff on a non-improving deficit (a resync genuinely can't fix)", () => {
    // Each simulated "day" clears the 24h gate so checkSyncHealth() runs
    // again within a single test, exactly like this device checking in on
    // consecutive days.
    function simulateNextDay() {
      localStorage.removeItem("dumos_last_sync_health_check");
    }

    const sameDeficitCounts = {
      success: true,
      counts: { products: 2705, stock_batches: 4000, sales: 5, customers: 3, categories: 13 },
    };
    function mockSameLocalDeficit() {
      mockLocalCounts({ products: 2700, stock_batches: 4000, sales: 5, customers: 3, categories: 13 });
    }

    it("still resyncs on the second consecutive non-improving check", async () => {
      getSyncCountsMock.mockResolvedValue(sameDeficitCounts);
      mockSameLocalDeficit();

      await checkSyncHealth();
      expect(forceFullResyncMock).toHaveBeenCalledTimes(1);

      simulateNextDay();
      await checkSyncHealth();
      expect(forceFullResyncMock).toHaveBeenCalledTimes(2);
    });

    it("stops resyncing on the third consecutive non-improving check, but keeps logging", async () => {
      getSyncCountsMock.mockResolvedValue(sameDeficitCounts);
      mockSameLocalDeficit();

      await checkSyncHealth();
      simulateNextDay();
      await checkSyncHealth();
      simulateNextDay();
      await checkSyncHealth();

      // Not a third resync - the first two already proved it doesn't help.
      expect(forceFullResyncMock).toHaveBeenCalledTimes(2);
      expect(logCrashMock).toHaveBeenCalledTimes(3);
      const [, , lastContext] = logCrashMock.mock.calls[2];
      expect(lastContext.givingUp).toBe("true");
    });

    it("resumes resyncing once the deficit actually improves", async () => {
      getSyncCountsMock.mockResolvedValue(sameDeficitCounts);
      mockSameLocalDeficit();

      await checkSyncHealth();
      simulateNextDay();
      await checkSyncHealth();
      simulateNextDay();
      await checkSyncHealth();
      expect(forceFullResyncMock).toHaveBeenCalledTimes(2); // backed off on the 3rd

      // A later, smaller gap - real progress, worth trying again.
      mockLocalCounts({ products: 2703, stock_batches: 4000, sales: 5, customers: 3, categories: 13 });
      simulateNextDay();
      await checkSyncHealth();

      expect(forceFullResyncMock).toHaveBeenCalledTimes(3);
    });

    it("clears the tracked deficit once the device fully catches up", async () => {
      getSyncCountsMock.mockResolvedValue(sameDeficitCounts);
      mockSameLocalDeficit();
      await checkSyncHealth();
      expect(localStorage.getItem("dumos_sync_health_deficit_state")).not.toBeNull();

      mockLocalCounts({ products: 2705, stock_batches: 4000, sales: 5, customers: 3, categories: 13 });
      simulateNextDay();
      await checkSyncHealth();

      expect(localStorage.getItem("dumos_sync_health_deficit_state")).toBeNull();
    });
  });
});
