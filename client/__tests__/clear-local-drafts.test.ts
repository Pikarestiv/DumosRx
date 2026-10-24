import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const clearPOSCartStorageMock = vi.fn();
vi.mock("@/lib/hooks/use-pos-cart", () => ({
  clearPOSCartStorage: clearPOSCartStorageMock,
}));

// Three device-local drafts (POS cart, cycle count, stock adjustment) each live under their own single global localStorage…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-clear-local-drafts-test-ts-L13
describe("clearLocalDrafts", () => {
  beforeEach(() => {
    localStorage.clear();
    clearPOSCartStorageMock.mockClear();
  });

  it("empties the cart, the cycle count and the stock adjustment together", async () => {
    const { useStockAuditDraftStore } = await import(
      "@/lib/hooks/use-stock-audit-draft"
    );
    const { useStockAdjustmentDraftStore } = await import(
      "@/lib/hooks/use-stock-adjustment-draft"
    );
    const { clearLocalDrafts } = await import("@/lib/utils/clear-local-drafts");

    useStockAuditDraftStore.getState().setItems([
      {
        id: "p1",
        name: "Panadol",
        sku: "SKU-1",
        category: "Analgesics",
        systemQty: 10,
        countedQty: 8,
        counted: true,
      },
    ]);
    useStockAdjustmentDraftStore.getState().setNote("counted short");

    expect(useStockAuditDraftStore.getState().items).toHaveLength(1);

    clearLocalDrafts();

    expect(clearPOSCartStorageMock).toHaveBeenCalledTimes(1);
    expect(useStockAuditDraftStore.getState().items).toEqual([]);
    expect(useStockAdjustmentDraftStore.getState().items).toEqual([]);
    expect(useStockAdjustmentDraftStore.getState().note).toBe("");
  });
});
