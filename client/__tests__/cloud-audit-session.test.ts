import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  toCloudItem,
  mergeCloudItemsIntoLocal,
} from "@/lib/hooks/use-cloud-audit-session";
import {
  AuditSessionConflictError,
  fetchActiveAuditSession,
  startAuditSession,
  takeoverAuditSession,
  completeAuditSession,
  heartbeatAuditSession,
  syncAuditSessionItems,
} from "@/lib/api/audit-sessions";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

vi.mock("@/lib/utils/device-id", () => ({
  getDeviceId: () => "TILL-TEST-01",
}));

vi.mock("@/lib/utils/device-label", () => ({
  getDeviceLabel: () => "Test Till 1",
}));

vi.mock("@/lib/storage-keys", () => ({
  getStoredActiveStoreId: () => "store-123",
  getStoredUser: () => ({ id: "user-456" }),
}));

vi.mock("@/lib/api/token-manager", () => ({
  getToken: () => "mock-jwt-token",
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    getBaseURL: () => "https://api.test/api/v1",
  },
}));

describe("Cloud Audit Session Helpers", () => {
  it("toCloudItem transforms AuditItem correctly", () => {
    const item: AuditItem = {
      id: "prod-1",
      name: "Amoxil",
      sku: "AMX",
      category: "Antibiotics",
      systemQty: 50,
      countedQty: 52,
      counted: true,
      costPrice: 100,
      countedCostPrice: 105,
      sellingPrice: 150,
      countedSellingPrice: 160,
      reason: "Surplus found",
      baselineQty: 50,
    };

    const cloud = toCloudItem(item);
    expect(cloud.product_id).toBe("prod-1");
    expect(cloud.system_quantity).toBe(50);
    expect(cloud.counted_quantity).toBe(52);
    expect(cloud.counted).toBe(true);
    expect(cloud.cost_price).toBe(100);
    expect(cloud.counted_cost_price).toBe(105);
    expect(cloud.selling_price).toBe(150);
    expect(cloud.counted_selling_price).toBe(160);
    expect(cloud.notes).toBe("Surplus found");
  });

  it("mergeCloudItemsIntoLocal merges remote counts into local sheet", () => {
    const localItems: AuditItem[] = [
      {
        id: "prod-1",
        name: "Amoxil",
        sku: "AMX",
        category: "Antibiotics",
        systemQty: 50,
        counted: false,
      },
      {
        id: "prod-2",
        name: "Paracetamol",
        sku: "PCM",
        category: "Analgesics",
        systemQty: 100,
        counted: true,
        countedQty: 95,
      },
    ];

    const cloudItems = [
      {
        product_id: "prod-1",
        counted: true,
        counted_quantity: 48,
        notes: "Counted on Till 2",
        counted_cost_price: 120,
      },
    ];

    const merged = mergeCloudItemsIntoLocal(localItems, cloudItems);
    expect(merged[0].counted).toBe(true);
    expect(merged[0].countedQty).toBe(48);
    expect(merged[0].reason).toBe("Counted on Till 2");
    expect(merged[0].countedCostPrice).toBe(120);

    expect(merged[1].counted).toBe(true);
    expect(merged[1].countedQty).toBe(95);
  });
});

describe("Cloud Audit Session API Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchActiveAuditSession issues GET request with correct headers", async () => {
    const mockSession = {
      id: "session-1",
      store_id: "store-123",
      status: "in_progress",
      active_till_id: "TILL-TEST-01",
      lease_version: 1,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, session: mockSession }),
    } as Response);

    const res = await fetchActiveAuditSession();
    expect(res.success).toBe(true);
    expect(res.session?.id).toBe("session-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/api/v1/app/audit-sessions/active?include_items=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-jwt-token",
          "X-Device-Id": "TILL-TEST-01",
          "X-Store-Id": "store-123",
        }),
      })
    );
  });

  it("startAuditSession throws AuditSessionConflictError on HTTP 409", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        message: "An active audit session already exists on another device.",
        conflict: true,
        session: { id: "existing-session", active_till_id: "TILL-OTHER" },
      }),
    } as Response);

    await expect(startAuditSession({ items: [] })).rejects.toThrow(
      AuditSessionConflictError
    );

    try {
      await startAuditSession({ items: [] });
    } catch (err) {
      const conflict = err as AuditSessionConflictError;
      expect(conflict.conflict).toBe(true);
      expect(conflict.statusCode).toBe(409);
      expect(conflict.session?.id).toBe("existing-session");
    }
  });

  it("heartbeatAuditSession sends till_id and lease_version", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        lease_expires_at: "2026-11-03T16:00:00Z",
        lease_version: 1,
      }),
    } as Response);

    const res = await heartbeatAuditSession("session-1", 1);
    expect(res.success).toBe(true);
    expect(res.lease_version).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/api/v1/app/audit-sessions/session-1/heartbeat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ till_id: "TILL-TEST-01", lease_version: 1 }),
      })
    );
  });

  it("syncAuditSessionItems posts batched counted items", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        total_items_count: 5,
        counted_items_count: 3,
        last_synced_at: "2026-11-03T15:30:00Z",
        lease_expires_at: "2026-11-03T15:35:00Z",
      }),
    } as Response);

    const res = await syncAuditSessionItems("session-1", 1, [
      { product_id: "p1", counted: true, counted_quantity: 10 },
    ]);

    expect(res.success).toBe(true);
    expect(res.counted_items_count).toBe(3);
  });

  it("takeoverAuditSession posts till details and returns updated lease", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        session: {
          id: "session-1",
          active_till_id: "TILL-TEST-01",
          lease_version: 2,
        },
      }),
    } as Response);

    const res = await takeoverAuditSession("session-1", "Till 2 battery died");
    expect(res.success).toBe(true);
    expect(res.session.lease_version).toBe(2);
    expect(res.session.active_till_id).toBe("TILL-TEST-01");
  });

  it("completeAuditSession posts submitted_stock_audit_id", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        session: {
          id: "session-1",
          status: "completion_pending_sync",
        },
      }),
    } as Response);

    const res = await completeAuditSession("session-1", 1, "audit-uuid-123");
    expect(res.success).toBe(true);
    expect(res.session.status).toBe("completion_pending_sync");
  });
});

