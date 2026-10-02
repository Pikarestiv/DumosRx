import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/db/core", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/db/core")>("../lib/db/core");
  return {
    ...actual,
    execute: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    getActiveStoreId: vi.fn().mockReturnValue("store-1"),
    isTauri: vi.fn().mockReturnValue(true),
    isWriterTab: vi.fn().mockReturnValue(true),
  };
});

vi.mock("../lib/storage-keys", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/storage-keys")>(
      "../lib/storage-keys",
    );
  return {
    ...actual,
    getAuthToken: vi.fn().mockReturnValue("test-token"),
    setLastSyncTime: vi.fn(),
  };
});

vi.mock("../lib/db/sync-engine/push", () => ({
  pushChanges: vi.fn().mockResolvedValue({ pushed: 0, failedBatches: 0 }),
}));

vi.mock("../lib/db/sync-engine/pull", () => ({
  pullChanges: vi.fn().mockResolvedValue({ pulled: 0, updatedTables: [] }),
}));

vi.mock("../lib/db/retention", () => ({
  pruneSyncedAuditLogs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/db/queries/setup", () => ({
  getSyncQueueBreakdown: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/utils/error-logger", () => ({
  logCrash: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/api/client", () => ({
  apiClient: {
    reconcileStockQuantities: vi.fn(),
    getSystemConfig: vi.fn().mockResolvedValue(null),
  },
}));

import { query, execute } from "../lib/db/core";
import { apiClient } from "../lib/api/client";
import { pushChanges } from "../lib/db/sync-engine/push";
import { pullChanges } from "../lib/db/sync-engine/pull";
import { reconcileStockQuantities } from "../lib/db/sync-engine";

/**
 * A-148: the repair path that lets the server adopt this device's own
 * stock_batches.quantity, which push() can never carry on its own.
 */
describe("reconcileStockQuantities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(pushChanges).mockResolvedValue({
      pushed: 0,
      failedBatches: 0,
    } as Awaited<ReturnType<typeof pushChanges>>);
    vi.mocked(pullChanges).mockResolvedValue({
      pulled: 0,
      updatedTables: [],
    } as Awaited<ReturnType<typeof pullChanges>>);
  });

  it("syncs with the cloud first, before reading or posting local quantities", async () => {
    vi.mocked(apiClient.reconcileStockQuantities).mockResolvedValue({
      success: true,
      reconciled: 0,
      checked: 0,
    });

    await reconcileStockQuantities();

    expect(pushChanges).toHaveBeenCalledTimes(1);
    expect(pullChanges).toHaveBeenCalledTimes(1);
  });

  it("refuses to reconcile when the pre-flight sync fails", async () => {
    vi.mocked(pullChanges).mockRejectedValue(new Error("network down"));

    await expect(reconcileStockQuantities()).rejects.toThrow();

    expect(apiClient.reconcileStockQuantities).not.toHaveBeenCalled();
  });

  it("posts every local non-deleted batch for the active store as {id, quantity}", async () => {
    vi.mocked(query).mockResolvedValue([
      { id: "batch-a", quantity: 12 },
      { id: "batch-b", quantity: 0 },
    ]);
    vi.mocked(apiClient.reconcileStockQuantities).mockResolvedValue({
      success: true,
      reconciled: 1,
      checked: 2,
    });

    const result = await reconcileStockQuantities();

    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toMatch(/FROM stock_batches/i);
    expect(sql).toMatch(/_deleted = 0/);
    expect(sql).toMatch(/store_id = \?/);
    expect(params).toEqual(["store-1"]);

    expect(apiClient.reconcileStockQuantities).toHaveBeenCalledWith({
      batches: [
        { id: "batch-a", quantity: 12 },
        { id: "batch-b", quantity: 0 },
      ],
    });
    expect(result).toEqual({ reconciled: 1, checked: 2 });
  });

  it("coerces a null local quantity to 0 rather than posting null", async () => {
    vi.mocked(query).mockResolvedValue([
      { id: "batch-a", quantity: null as unknown as number },
    ]);
    vi.mocked(apiClient.reconcileStockQuantities).mockResolvedValue({
      success: true,
      reconciled: 0,
      checked: 1,
    });

    await reconcileStockQuantities();

    expect(apiClient.reconcileStockQuantities).toHaveBeenCalledWith({
      batches: [{ id: "batch-a", quantity: 0 }],
    });
  });

  it("does not call the server when there are no local batches", async () => {
    const result = await reconcileStockQuantities();

    expect(apiClient.reconcileStockQuantities).not.toHaveBeenCalled();
    expect(result).toEqual({ reconciled: 0, checked: 0 });
  });

  it("stores each returned movement locally as already-synced, so this device's next pull never re-applies its own correction", async () => {
    vi.mocked(query).mockResolvedValue([{ id: "batch-a", quantity: 250 }]);
    vi.mocked(apiClient.reconcileStockQuantities).mockResolvedValue({
      success: true,
      reconciled: 1,
      checked: 1,
      movements: [
        {
          id: "move-1",
          stock_batch_id: "batch-a",
          product_id: "prod-1",
          store_id: "store-1",
          movement_type: "sync_reconciliation",
          quantity: 250,
          reason: "Automatic stock quantity reconciliation",
          performed_by: "user-1",
          movement_date: "2026-10-02T00:00:00.000000Z",
          created_at: "2026-10-02T00:00:00.000000Z",
          updated_at: "2026-10-02T00:00:00.000000Z",
        },
      ],
    });

    await reconcileStockQuantities();

    const insertCall = vi
      .mocked(execute)
      .mock.calls.find(([sql]) => sql.includes("INSERT INTO stock_movements"));
    if (!insertCall) {
      throw new Error("Expected an INSERT INTO stock_movements call");
    }
    const [sql, params] = insertCall;
    expect(sql).toMatch(/INSERT INTO stock_movements/);
    expect(params).toEqual([
      "move-1",
      "batch-a",
      "prod-1",
      "store-1",
      "sync_reconciliation",
      250,
      "Automatic stock quantity reconciliation",
      "user-1",
      "2026-10-02T00:00:00.000000Z",
      "2026-10-02T00:00:00.000000Z",
      "2026-10-02T00:00:00.000000Z",
      expect.any(String),
    ]);
  });

  it("swallows a UNIQUE constraint failure when storing a movement already present locally", async () => {
    vi.mocked(query).mockResolvedValue([{ id: "batch-a", quantity: 250 }]);
    vi.mocked(apiClient.reconcileStockQuantities).mockResolvedValue({
      success: true,
      reconciled: 1,
      checked: 1,
      movements: [
        {
          id: "move-1",
          stock_batch_id: "batch-a",
          product_id: "prod-1",
          store_id: "store-1",
          movement_type: "sync_reconciliation",
          quantity: 250,
          reason: null,
          performed_by: "user-1",
          movement_date: "2026-10-02T00:00:00.000000Z",
          created_at: "2026-10-02T00:00:00.000000Z",
          updated_at: "2026-10-02T00:00:00.000000Z",
        },
      ],
    });
    vi.mocked(execute).mockRejectedValueOnce(
      new Error("UNIQUE constraint failed: stock_movements.id"),
    );

    await expect(reconcileStockQuantities()).resolves.toEqual({
      reconciled: 1,
      checked: 1,
    });
  });
});
