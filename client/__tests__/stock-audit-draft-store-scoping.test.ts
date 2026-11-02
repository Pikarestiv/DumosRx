import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("stock audit draft store scoping", () => {
  beforeEach(async () => {
    localStorage.clear();
    const { useStockAuditDraftStore } = await import(
      "@/lib/hooks/use-stock-audit-draft"
    );
    useStockAuditDraftStore.getState().clearAllDrafts();
  });

  it("partitions audit drafts by storeId so switching stores never wipes in-progress counts", async () => {
    const { useStockAuditDraftStore, hasActiveStockAuditCount } = await import(
      "@/lib/hooks/use-stock-audit-draft"
    );
    const { clearLocalDrafts } = await import("@/lib/utils/clear-local-drafts");

    // 1. Cynthia counts in Store A
    useStockAuditDraftStore.getState().setActiveStoreId("store-a");
    useStockAuditDraftStore.getState().setItems([
      {
        id: "prod-1",
        name: "Amoxil 500mg",
        sku: "AMX-1",
        category: "Antibiotics",
        systemQty: 20,
        countedQty: 18,
        counted: true,
      },
    ]);

    expect(useStockAuditDraftStore.getState().items).toHaveLength(1);
    expect(useStockAuditDraftStore.getState().items[0].countedQty).toBe(18);
    expect(hasActiveStockAuditCount("store-a")).toBe(true);

    // 2. Cynthia switches to Store B
    // store-context executes clearLocalDrafts({ preserveStoreAudit: true })
    clearLocalDrafts({ preserveStoreAudit: true });
    useStockAuditDraftStore.getState().setActiveStoreId("store-b");

    // Store B should have an empty draft, not Store A's items
    expect(useStockAuditDraftStore.getState().items).toEqual([]);
    expect(hasActiveStockAuditCount("store-b")).toBe(false);

    // 3. Cynthia adds a count in Store B
    useStockAuditDraftStore.getState().setItems([
      {
        id: "prod-2",
        name: "Paracetamol 500mg",
        sku: "PCM-1",
        category: "Analgesics",
        systemQty: 50,
        countedQty: 50,
        counted: true,
      },
    ]);
    expect(useStockAuditDraftStore.getState().items).toHaveLength(1);
    expect(useStockAuditDraftStore.getState().items[0].name).toBe("Paracetamol 500mg");

    // 4. Cynthia switches back to Store A
    clearLocalDrafts({ preserveStoreAudit: true });
    useStockAuditDraftStore.getState().setActiveStoreId("store-a");

    // Store A's draft is completely restored with Amoxil!
    expect(useStockAuditDraftStore.getState().items).toHaveLength(1);
    expect(useStockAuditDraftStore.getState().items[0].name).toBe("Amoxil 500mg");
    expect(useStockAuditDraftStore.getState().items[0].countedQty).toBe(18);
  });
});
