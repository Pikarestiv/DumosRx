import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Procurement used to be one coarse RequireRole gate (isAdmin || canManageStockBatch) covering creating, editing, sending,…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-purchase-order-details-permissions-test-tsx-L4

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

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
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

  it("offers Edit and Delete in the menu and Receive Items with both keys", () => {
    renderDetails(po());
    expect(screen.queryByText("Receive Items")).not.toBeNull();
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Edit order" })).not.toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Delete order/ })).not.toBeNull();
  });

  it("hides the write actions without manage_purchase_orders, keeping Receive", () => {
    deny("manage_purchase_orders");
    renderDetails(po());
    expect(screen.queryByText("Receive Items")).not.toBeNull();
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Edit order" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Delete order/ })).toBeNull();
  });

  it("hides Mark as Sent without manage_purchase_orders", () => {
    deny("manage_purchase_orders");
    renderDetails(po({ status: "pending" }));
    expect(screen.queryByText("Mark as Sent")).toBeNull();
  });

  it("hides Receive Items without receive_purchase_orders, keeping the write actions", () => {
    deny("receive_purchase_orders");
    renderDetails(po());
    expect(screen.queryByText("Receive Items")).toBeNull();
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Edit order" })).not.toBeNull();
  });

  it("still shows the order itself and Download PDF without either key", () => {
    deny("manage_purchase_orders", "receive_purchase_orders");
    renderDetails(po());
    expect(screen.queryByText("Download PDF")).not.toBeNull();
    expect(screen.queryAllByText(/Emzor/).length).toBeGreaterThan(0);
  });

  it("keeps a draft to two buttons: Edit and Mark as Sent", () => {
    renderDetails(po({ status: "pending" }));
    const names = screen.getAllByRole("button").map((b) => b.textContent?.trim()).filter(Boolean);
    expect(names).toEqual(expect.arrayContaining(["Edit", "Mark as Sent"]));
    expect(screen.queryByText("Download PDF")).toBeNull();
  });

  it("offers Receive Goods on a draft immediate purchase", () => {
    renderDetails(po({ status: "pending", type: "immediate" }));
    expect(screen.queryByText("Receive Goods")).not.toBeNull();
    expect(screen.queryByText("Mark as Sent")).toBeNull();
  });

  it("offers Receive Remaining on a partially received order and no deleting", () => {
    renderDetails(po({ status: "partially_received" }));
    expect(screen.queryByText("Receive Remaining")).not.toBeNull();
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /Delete order/ })).toBeNull();
  });

  it("locks a received order to Download PDF with a notice", () => {
    renderDetails(po({ status: "received" }));
    expect(screen.queryByText("Download PDF")).not.toBeNull();
    expect(screen.queryByText("All items received. This order is now locked.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Receive/ })).toBeNull();
  });
});
