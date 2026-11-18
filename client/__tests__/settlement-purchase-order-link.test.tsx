import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  ADJUSTMENT_REASON_NOTE_SEPARATOR,
  BACKORDER_SETTLEMENT_REASON,
  BACKORDER_SETTLEMENT_REFERENCE_TYPE,
} from "@/lib/constants/stock-adjustments";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";
import { mapMovement } from "@/components/stock-batch/stock-movement-mapping";
import {
  formatPoReference,
  type StockMovement,
} from "@/components/stock-batch/stock-movement-utils";
import { StockMovementDesktopRow } from "@/components/stock-batch/stock-movement-desktop-row";
import { StockMovementDetailModal } from "@/components/stock-batch/stock-movement-detail-modal";
import { StockMovementMobileGroup } from "@/components/stock-batch/stock-movement-mobile-group";
import { StockMovementDetailsDialog } from "@/components/dashboard/modals/stock-movement-details-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeType: "pharmacy",
    storeProfile: { uppercase_display_enabled: 0 },
  }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

vi.mock("@/lib/db/queries/products", () => ({
  getProductBasicInfo: vi.fn(() => Promise.resolve({ name: "Amoxicillin 500mg", dosage_form: null })),
}));

describe("A-341: Backorder settlement purchase order delivery linking", () => {
  const rawPoId = "87f4a2b9-482f-4b0d-9c3a-123456789abc";
  const settlementRow: StockMovementDbRow = {
    id: "m-settle-1",
    product_id: "p1",
    product_name: "Amoxicillin 500mg",
    stock_batch_id: "b1",
    movement_type: "adjustment",
    reference_type: BACKORDER_SETTLEMENT_REFERENCE_TYPE,
    reference_id: "sale-98765",
    quantity: -2,
    reason: `${BACKORDER_SETTLEMENT_REASON}${ADJUSTMENT_REASON_NOTE_SEPARATOR}${rawPoId}`,
    movement_date: "2026-10-26T14:30:00.000Z",
    created_at: "2026-10-26T14:30:00.000Z",
    performed_by_name: "Pharmacist Jane",
  };

  it("formatPoReference formats raw UUIDs and preserves PO- prefixes", () => {
    expect(formatPoReference(rawPoId)).toBe("PO-87F4A2B9");
    expect(formatPoReference("PO-999")).toBe("PO-999");
    expect(formatPoReference("po-402")).toBe("PO-402");
    expect(formatPoReference("")).toBe("");
    expect(formatPoReference(undefined)).toBe("");
  });

  it("mapMovement parses purchaseOrderId from settlement reason note", () => {
    const mapped = mapMovement(settlementRow);

    expect(mapped.type).toBe("backorder_settlement");
    expect(mapped.purchaseOrderId).toBe(rawPoId);
    expect(mapped.reason).not.toContain(rawPoId);
    expect(mapped.reason).toContain("PO-87F4A2B9");
  });

  it("StockMovementDesktopRow displays the formatted PO delivery reference for settlements", () => {
    const movement: StockMovement = mapMovement(settlementRow);

    render(<StockMovementDesktopRow movement={movement} onSelect={vi.fn()} />);

    expect(screen.getByText(/Settled via PO-87F4A2B9/i)).toBeTruthy();
  });

  it("StockMovementMobileGroup displays the formatted PO reference instead of raw UUID", () => {
    const movement: StockMovement = mapMovement(settlementRow);

    render(
      <StockMovementMobileGroup
        groupLabel="TODAY"
        movements={[movement]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/Settled via PO-87F4A2B9/i)).toBeTruthy();
    expect(screen.queryByText(new RegExp(rawPoId))).toBeNull();
  });

  it("StockMovementDetailModal renders a link to the purchase order delivery", () => {
    const movement: StockMovement = mapMovement(settlementRow);

    render(
      <StockMovementDetailModal
        movement={movement}
        onClose={vi.fn()}
        onViewInCatalog={vi.fn()}
      />,
    );

    const poLink = screen.getByRole("link", { name: /View Delivery \(PO-87F4A2B9\)/i });
    expect(poLink).toBeTruthy();
    expect(poLink.getAttribute("href")).toBe(`/procurement?selected=${rawPoId}`);
  });

  it("StockMovementDetailsDialog renders a delivery link and clean notes for settlements", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StockMovementDetailsDialog
          movement={settlementRow}
          open={true}
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Already sold before this delivery")).toBeTruthy();
    const poLink = screen.getByRole("link", { name: /View Delivery \(PO-87F4A2B9\)/i });
    expect(poLink).toBeTruthy();
    expect(poLink.getAttribute("href")).toBe(`/procurement?selected=${rawPoId}`);
  });
});
