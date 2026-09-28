import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Procurement used to be one coarse RequireRole gate (isAdmin ||
 * canManageStockBatch) covering creating, editing, sending, deleting AND
 * receiving a purchase order. "manage_purchase_orders" now fronts the
 * write-the-order actions and "receive_purchase_orders" fronts booking the
 * goods in, which is a genuinely different job: a stockroom account can be
 * allowed to receive a delivery without being allowed to raise or amend
 * the order it arrived against. The order itself, and Download PDF, stay
 * visible to anyone who can reach the panel.
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
  capitalizeWords: (s: string) => s,
}));

import { PurchaseOrderDetails } from "@/components/procurement/purchase-order-details";
import type { PurchaseOrder } from "@/lib/db/procurement";

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po1",
    order_number: "PO-001",
    supplier_id: "s1",
    status: "sent",
    type: "standard",
    total_amount: 5000,
    created_at: "2026-01-01",
    vendor_name: "Emzor",
    payment_status: "unpaid",
    amount_paid: 0,
    items: [],
    ...overrides,
  } as PurchaseOrder;
}

function renderDetails(order: PurchaseOrder) {
  render(
    <PurchaseOrderDetails
      selectedPO={order}
      isLoadingDetails={false}
      getStatusBadge={() => null}
      onSendPO={vi.fn()}
      onDeletePO={vi.fn()}
      onReceiveGoods={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

function deny(...denied: string[]) {
  hasPermission.mockImplementation((key: string) => !denied.includes(key));
}

describe("Purchase order details permissions", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks both procurement keys", () => {
    renderDetails(po());
    expect(hasPermission).toHaveBeenCalledWith("manage_purchase_orders");
    expect(hasPermission).toHaveBeenCalledWith("receive_purchase_orders");
  });

  it("offers Edit, Delete and Receive with both keys", () => {
    renderDetails(po());
    expect(screen.queryByText("Edit Order")).not.toBeNull();
    expect(screen.queryByText("Delete")).not.toBeNull();
    expect(screen.queryByText("Receive Goods")).not.toBeNull();
  });

  it("hides the write actions without manage_purchase_orders, keeping Receive", () => {
    deny("manage_purchase_orders");
    renderDetails(po());
    expect(screen.queryByText("Edit Order")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
    expect(screen.queryByText("Receive Goods")).not.toBeNull();
  });

  it("hides Mark as Sent without manage_purchase_orders", () => {
    deny("manage_purchase_orders");
    renderDetails(po({ status: "pending" }));
    expect(screen.queryByText("Mark as Sent")).toBeNull();
  });

  it("hides Receive Goods without receive_purchase_orders, keeping the write actions", () => {
    deny("receive_purchase_orders");
    renderDetails(po());
    expect(screen.queryByText("Receive Goods")).toBeNull();
    expect(screen.queryByText("Edit Order")).not.toBeNull();
  });

  it("still shows the order itself and Download PDF without either key", () => {
    deny("manage_purchase_orders", "receive_purchase_orders");
    renderDetails(po());
    expect(screen.queryByText("Download PDF")).not.toBeNull();
    expect(screen.queryAllByText(/Emzor/).length).toBeGreaterThan(0);
  });
});
