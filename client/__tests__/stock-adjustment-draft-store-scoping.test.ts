import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("stock adjustment draft store scoping", () => {
  beforeEach(async () => {
    localStorage.clear();
    const { useStockAdjustmentDraftStore } = await import(
      "@/lib/hooks/use-stock-adjustment-draft"
    );
    useStockAdjustmentDraftStore.getState().clearAllDrafts();
  });

  it("partitions adjustment drafts by storeId so switching stores never wipes in-progress adjustments", async () => {
    const {
      useStockAdjustmentDraftStore,
      hasActiveStockAdjustmentDraft,
    } = await import("@/lib/hooks/use-stock-adjustment-draft");
    const { clearLocalDrafts } = await import("@/lib/utils/clear-local-drafts");

    // 1. User starts adjustment in Store A
    useStockAdjustmentDraftStore.getState().setActiveStoreId("store-a");
    useStockAdjustmentDraftStore.getState().setReason("loss");
    useStockAdjustmentDraftStore.getState().setNote("Lost syrup batch");
    useStockAdjustmentDraftStore.getState().addItem({
      productId: "prod-1",
      name: "Cough Syrup",
      sku: "SYR-1",
      currentStock: 20,
      quantity: 5,
    });

    expect(useStockAdjustmentDraftStore.getState().items).toHaveLength(1);
    expect(useStockAdjustmentDraftStore.getState().reason).toBe("loss");
    expect(useStockAdjustmentDraftStore.getState().note).toBe("Lost syrup batch");
    expect(hasActiveStockAdjustmentDraft("store-a")).toBe(true);

    // 2. User switches to Store B
    clearLocalDrafts({ preserveStoreAudit: true, preserveStoreAdjustment: true });
    useStockAdjustmentDraftStore.getState().setActiveStoreId("store-b");

    // Store B should have an empty draft, not Store A's items
    expect(useStockAdjustmentDraftStore.getState().items).toEqual([]);
    expect(useStockAdjustmentDraftStore.getState().note).toBe("");
    expect(hasActiveStockAdjustmentDraft("store-b")).toBe(false);

    // 3. User adds an adjustment in Store B
    useStockAdjustmentDraftStore.getState().setReason("damage");
    useStockAdjustmentDraftStore.getState().setNote("Broken vial in Store B");
    useStockAdjustmentDraftStore.getState().addItem({
      productId: "prod-2",
      name: "Gentamicin Ampoules",
      sku: "GEN-1",
      currentStock: 10,
      quantity: 2,
    });
    expect(useStockAdjustmentDraftStore.getState().items).toHaveLength(1);
    expect(useStockAdjustmentDraftStore.getState().note).toBe("Broken vial in Store B");

    // 4. User switches back to Store A
    clearLocalDrafts({ preserveStoreAudit: true, preserveStoreAdjustment: true });
    useStockAdjustmentDraftStore.getState().setActiveStoreId("store-a");

    // Store A's draft is completely restored!
    expect(useStockAdjustmentDraftStore.getState().items).toHaveLength(1);
    expect(useStockAdjustmentDraftStore.getState().items[0].name).toBe("Cough Syrup");
    expect(useStockAdjustmentDraftStore.getState().reason).toBe("loss");
    expect(useStockAdjustmentDraftStore.getState().note).toBe("Lost syrup batch");
  });

  it("recovers unpartitioned legacy v1 adjustment drafts and adopts them for the active store", async () => {
    const { useStockAdjustmentDraftStore } = await import(
      "@/lib/hooks/use-stock-adjustment-draft"
    );

    // Simulate Zustand rehydrating an un-scoped legacy v1 draft
    useStockAdjustmentDraftStore.setState({
      activeStoreId: null,
      drafts: {},
      reason: "damage",
      note: "Legacy drop damage",
      items: [
        {
          productId: "prod-legacy",
          name: "Legacy Drop",
          sku: "LEG-1",
          currentStock: 15,
          quantity: 3,
        },
      ],
    });

    // When the app initializes Store Context and calls setActiveStoreId("store-main")
    useStockAdjustmentDraftStore.getState().setActiveStoreId("store-main");

    // The legacy items are preserved in active items AND adopted into drafts["store-main"]
    const state = useStockAdjustmentDraftStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe("Legacy Drop");
    expect(state.note).toBe("Legacy drop damage");
    expect(state.drafts["store-main"]).toBeDefined();
    expect(state.drafts["store-main"].items).toHaveLength(1);
    expect(state.drafts["store-main"].note).toBe("Legacy drop damage");
  });
});
