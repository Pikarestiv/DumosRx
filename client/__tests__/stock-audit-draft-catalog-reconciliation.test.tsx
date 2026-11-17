import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import type { ProductWithDetails } from "@/lib/types/product";
import {
  toAuditItem,
  reconcileAuditDraftWithCatalog,
} from "@/components/stock-batch/audit-reconciliation";
import {
  selectAdjustedAuditItems,
  toStockAuditSubmissions,
} from "@/components/stock-batch/audit-derivations";
import { AuditLedgerRowCells } from "@/components/stock-batch/audit-ledger-row-cells";
import { AuditReviewStep } from "@/components/stock-batch/audit-review-step";

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

function mockProduct(overrides: Partial<ProductWithDetails> = {}): ProductWithDetails {
  return {
    id: "p1",
    name: "Paracetamol 500mg",
    barcode: "BAR-1",
    category_id: "cat-1",
    category_name: "Analgesics",
    stock_quantity: 20,
    cost_price: 50,
    selling_price: 100,
    last_audited_at: null,
    ...overrides,
  };
}

function mockItem(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    id: "p1",
    name: "Paracetamol 500mg",
    sku: "BAR-1",
    category: "Analgesics",
    systemQty: 20,
    countedQty: undefined,
    costPrice: 50,
    countedCostPrice: 50,
    sellingPrice: 100,
    countedSellingPrice: 100,
    lastAuditedAt: null,
    ...overrides,
  };
}

describe("A-259: cycle-count draft catalog reconciliation", () => {
  describe("toAuditItem", () => {
    it("transforms ProductWithDetails to AuditItem with uncounted state", () => {
      const p = mockProduct({ id: "p-new", name: "Amoxicillin 250mg" });
      const item = toAuditItem(p);
      expect(item.id).toBe("p-new");
      expect(item.name).toBe("Amoxicillin 250mg");
      expect(item.countedQty).toBeUndefined();
      expect(item.counted).toBeUndefined();
      expect(item.systemQty).toBe(20);
    });
  });

  describe("reconcileAuditDraftWithCatalog", () => {
    it("returns the draft unchanged if draft or live catalog is empty", () => {
      expect(reconcileAuditDraftWithCatalog([], [mockProduct()])).toEqual([]);
      const draft = [mockItem()];
      expect(reconcileAuditDraftWithCatalog(draft, [])).toBe(draft);
    });

    it("appends newly created products from live catalog to the draft", () => {
      const draft = [mockItem({ id: "p1", name: "Existing Counted", countedQty: 15, counted: true })];
      const live = [
        mockProduct({ id: "p1", name: "Existing Counted" }),
        mockProduct({ id: "p2", name: "Newly Added Product" }),
      ];

      const reconciled = reconcileAuditDraftWithCatalog(draft, live);
      expect(reconciled).toHaveLength(2);
      expect(reconciled[0].id).toBe("p1");
      expect(reconciled[0].countedQty).toBe(15);
      expect(reconciled[1].id).toBe("p2");
      expect(reconciled[1].name).toBe("Newly Added Product");
      expect(reconciled[1].countedQty).toBeUndefined();
    });

    it("drops soft-deleted products that were never counted", () => {
      const draft = [
        mockItem({ id: "p1", name: "Kept Counted", countedQty: 10 }),
        mockItem({ id: "p-deleted", name: "Deleted Uncounted", countedQty: undefined }),
      ];
      const live = [mockProduct({ id: "p1", name: "Kept Counted" })];

      const reconciled = reconcileAuditDraftWithCatalog(draft, live);
      expect(reconciled).toHaveLength(1);
      expect(reconciled[0].id).toBe("p1");
      expect(reconciled.find((i) => i.id === "p-deleted")).toBeUndefined();
    });

    it("marks soft-deleted products as isDeleted: true if they were counted", () => {
      const draft = [
        mockItem({ id: "p1", name: "Live Counted", countedQty: 10 }),
        mockItem({ id: "p-deleted", name: "Deleted But Counted", countedQty: 5, counted: true }),
      ];
      const live = [mockProduct({ id: "p1", name: "Live Counted" })];

      const reconciled = reconcileAuditDraftWithCatalog(draft, live);
      expect(reconciled).toHaveLength(2);
      const deletedItem = reconciled.find((i) => i.id === "p-deleted");
      expect(deletedItem).toBeDefined();
      expect(deletedItem?.isDeleted).toBe(true);
      expect(deletedItem?.countedQty).toBe(5);
    });

    it("restores isDeleted: false if a deleted product reappears in live catalog", () => {
      const draft = [mockItem({ id: "p1", isDeleted: true, countedQty: 5 })];
      const live = [mockProduct({ id: "p1" })];

      const reconciled = reconcileAuditDraftWithCatalog(draft, live);
      expect(reconciled[0].isDeleted).toBe(false);
    });

    it("refreshes system stock and prices for uncounted items", () => {
      const draft = [mockItem({ id: "p1", systemQty: 20, sellingPrice: 100 })];
      const live = [mockProduct({ id: "p1", stock_quantity: 35, selling_price: 120 })];

      const reconciled = reconcileAuditDraftWithCatalog(draft, live);
      expect(reconciled[0].systemQty).toBe(35);
      expect(reconciled[0].sellingPrice).toBe(120);
      expect(reconciled[0].countedSellingPrice).toBe(120);
    });

    it("preserves counted numbers on counted items while refreshing lastAuditedAt", () => {
      const draft = [
        mockItem({
          id: "p1",
          systemQty: 20,
          countedQty: 22,
          lastAuditedAt: null,
        }),
      ];
      const live = [
        mockProduct({
          id: "p1",
          stock_quantity: 50, // Live stock changed, but counted row retains baseline/counted
          last_audited_at: "2026-10-15T00:00:00Z",
        }),
      ];

      const reconciled = reconcileAuditDraftWithCatalog(draft, live);
      expect(reconciled[0].countedQty).toBe(22);
      expect(reconciled[0].lastAuditedAt).toBe("2026-10-15T00:00:00Z");
    });

    it("returns the exact same array reference if nothing changed", () => {
      const draft = [mockItem({ id: "p1", systemQty: 20, sellingPrice: 100 })];
      const live = [mockProduct({ id: "p1", stock_quantity: 20, selling_price: 100 })];

      const reconciled = reconcileAuditDraftWithCatalog(draft, live);
      expect(reconciled).toBe(draft);
    });
  });

  describe("submission gating", () => {
    it("excludes isDeleted items from selectAdjustedAuditItems", () => {
      const items = [
        mockItem({ id: "p1", countedQty: 25, systemQty: 20 }), // adjusted
        mockItem({ id: "p2", countedQty: 30, systemQty: 20, isDeleted: true }), // adjusted but deleted
      ];

      const adjusted = selectAdjustedAuditItems(items);
      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].id).toBe("p1");
    });

    it("excludes isDeleted items from toStockAuditSubmissions", () => {
      const items = [
        mockItem({ id: "p1", countedQty: 25, systemQty: 20 }),
        mockItem({ id: "p2", countedQty: 30, systemQty: 20, isDeleted: true }),
      ];

      const submissions = toStockAuditSubmissions(items);
      expect(submissions).toHaveLength(1);
      expect(submissions[0].productId).toBe("p1");
    });
  });

  describe("UI display", () => {
    it("disables editing and displays Deleted badge in AuditLedgerRowCells", () => {
      const item = mockItem({ id: "p-del", isDeleted: true, countedQty: 10 });
      render(
        <div role="row">
          <AuditLedgerRowCells
            item={item}
            canEditProductCost={true}
            canEditProductPrice={true}
            onUpdateItem={vi.fn()}
            onCountRow={vi.fn()}
            onClearCount={vi.fn()}
          />
        </div>,
      );

      expect(screen.getByText("Deleted")).toBeDefined();
      const checkbox = screen.getByRole("checkbox");
      expect((checkbox as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows a warning banner in AuditReviewStep when counted items contain deleted products", () => {
      const countedItems = [
        mockItem({ id: "p1", countedQty: 10 }),
        mockItem({ id: "p-del", countedQty: 5, isDeleted: true }),
      ];
      render(
        <AuditReviewStep
          countedItems={countedItems}
          adjustedItems={[]}
          freshness={{
            localMinutes: 0,
            isLocalStale: false,
            stalePeers: [],
            thresholdMinutes: 60,
            deficits: [],
            owed: [],
            shouldWarn: false,
          }}
          staleAcknowledged={false}
          onStaleAcknowledgedChange={vi.fn()}
        />,
      );

      expect(
        screen.getByText(
          "1 item(s) counted in this draft were deleted from the catalog and will not be adjusted.",
        ),
      ).toBeDefined();
    });
  });
});
