import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const clearPOSCartStorageMock = vi.fn();
vi.mock("@/lib/hooks/use-pos-cart", () => ({
  clearPOSCartStorage: clearPOSCartStorageMock,
}));

/**
 * Three device-local drafts (POS cart, cycle count, stock adjustment) each
 * live under their own single global localStorage key with no store or user
 * in it, so every path that tears down one store/account's context has to
 * drop all three. Two of the five - linking a new cloud store and the
 * factory reset - were clearing only the cart, so a count started against
 * the outgoing store's product ids survived into the new one and could be
 * submitted against foreign ids. They now all call one function; this pins
 * that it really empties all three.
 */
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
