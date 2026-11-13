import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/core")>()),
  initDatabase: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/db/queries/stock-audit-drafts", () => ({
  getLocalStockAuditDraft: vi.fn(() => Promise.resolve(null)),
  saveLocalStockAuditDraft: vi.fn(() => Promise.resolve()),
  deleteLocalStockAuditDraft: vi.fn(() => Promise.resolve()),
  hasAnyLocalStockAuditCount: vi.fn(() => Promise.resolve(false)),
  clearAllLocalStockAuditDrafts: vi.fn(() => Promise.resolve()),
}));

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

  it("recovers unpartitioned legacy v1 drafts and adopts them for the active store", async () => {
    const { useStockAuditDraftStore } = await import(
      "@/lib/hooks/use-stock-audit-draft"
    );

    // Simulate Zustand rehydrating an un-scoped legacy v1 draft where items exist but drafts is empty
    useStockAuditDraftStore.setState({
      activeStoreId: null,
      drafts: {},
      items: [
        {
          id: "prod-legacy",
          name: "Legacy Syrup",
          sku: "LEG-1",
          category: "Syrups",
          systemQty: 10,
          countedQty: 8,
          counted: true,
        },
      ],
    });

    // When the app initializes Store Context and calls setActiveStoreId("store-main")
    useStockAuditDraftStore.getState().setActiveStoreId("store-main");

    // The legacy items are preserved in active items AND adopted into drafts["store-main"]
    const state = useStockAuditDraftStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe("Legacy Syrup");
    expect(state.drafts["store-main"]).toBeDefined();
    expect(state.drafts["store-main"]).toHaveLength(1);
    expect(state.drafts["store-main"][0].countedQty).toBe(8);
  });
});

