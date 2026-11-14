import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("@/lib/utils/error-logger", () => ({
  logCrash: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/utils/impersonation", () => ({
  isImpersonatedSession: () => false,
}));

vi.mock("../lib/db/sync-engine/index", () => ({
  forceFullResync: vi.fn().mockResolvedValue({ success: true, pushed: 0, pulled: 0 }),
}));

let healOutcomeMock: import("../lib/db/sync-engine/stock-auto-heal").HealStockIntegrityOutcome = {
  diverged: 0,
  unreconstructable: 0,
  folded: 0,
  skipped: null,
};

vi.mock("../lib/db/sync-engine/stock-auto-heal", () => ({
  healStockIntegrity: vi.fn(async () => healOutcomeMock),
}));

import { checkSyncHealth } from "../lib/db/sync-engine/health-check";

const LAST_CHECK_KEY = "dumos_last_sync_health_check";

describe("A-238: healStockIntegrity skip does not burn 24h health check interval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("auth_token", "test-token");
    localStorage.setItem("last_sync_time", new Date().toISOString());
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    getSyncCountsMock.mockResolvedValue({
      success: true,
      counts: { products: 10, stock_batches: 20, sales: 5, customers: 3, categories: 2 },
    });
    queryMock.mockResolvedValue([{ count: 10 }]);
  });

  it("does NOT stamp the 24h check interval when auto-heal is skipped due to incomplete movement log", async () => {
    healOutcomeMock = {
      diverged: 2,
      unreconstructable: 0,
      folded: 0,
      skipped: "movement-log-incomplete",
    };

    await checkSyncHealth();

    expect(getSyncCountsMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LAST_CHECK_KEY)).toBeNull();
  });

  it("does NOT stamp the 24h check interval when auto-heal is skipped during on-till inspection session", async () => {
    healOutcomeMock = {
      diverged: 2,
      unreconstructable: 0,
      folded: 0,
      skipped: "inspection-session",
    };

    await checkSyncHealth();

    expect(getSyncCountsMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LAST_CHECK_KEY)).toBeNull();
  });

  it("retries immediately on next run when heal was previously skipped, and stamps only upon unskipped heal", async () => {
    // 1. First run: movement log is still catching up (skipped)
    healOutcomeMock = {
      diverged: 3,
      unreconstructable: 0,
      folded: 0,
      skipped: "movement-log-incomplete",
    };
    await checkSyncHealth();

    expect(localStorage.getItem(LAST_CHECK_KEY)).toBeNull();

    // 2. Second run: next sync round completed, movement log is now complete (heal succeeds)
    healOutcomeMock = {
      diverged: 3,
      unreconstructable: 0,
      folded: 3,
      skipped: null,
    };
    await checkSyncHealth();

    expect(getSyncCountsMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(LAST_CHECK_KEY)).not.toBeNull();

    // 3. Third run: now that the unskipped heal ran, the 24h interval is active and prevents immediate re-checking
    await checkSyncHealth();
    expect(getSyncCountsMock).toHaveBeenCalledTimes(2);
  });

  it("stamps the 24h interval when device is clean (no divergence) and not skipped", async () => {
    healOutcomeMock = {
      diverged: 0,
      unreconstructable: 0,
      folded: 0,
      skipped: null,
    };

    await checkSyncHealth();

    expect(getSyncCountsMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LAST_CHECK_KEY)).not.toBeNull();
  });
});
