import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
  useDisplayName: () => (s: string) => s,
  capitalizeWords: (s: string) => s,
}));
vi.mock("@/components/procurement/owed-settlement-notice", () => ({ OwedSettlementNotice: () => null }));
vi.mock("@/lib/db/procurement-void-receipt", () => ({ getPurchaseOrderReceipts: () => Promise.resolve([]), voidPurchaseOrderReceipt: vi.fn() }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const onReceiveGoods = vi.fn();
const onReceiveDraft = vi.fn((_id: string, _items: unknown[]) => Promise.resolve(true));

function renderDetails(order: PurchaseOrder) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <PurchaseOrderDetails
      selectedPO={order}
      isLoadingDetails={false}
      getStatusBadge={() => null}
      onSendPO={vi.fn()}
      onDeletePO={vi.fn()}
      onReceiveGoods={onReceiveGoods}
      onReceiveDraft={onReceiveDraft}
      onClose={vi.fn()}
    />
    </QueryClientProvider>,
  );
}

const draftLine = {
  id: "line1",
  po_id: "po1",
  product_id: "p1",
  product_name: "Panadol",
  bulk_unit: "Carton",
  base_unit: "Tablet",
  bulk_quantity: 2,
  quantity_received: 0,
  units_per_bulk: 10,
  product_units_per_bulk: 10,
  unit_cost: 100,
  subtotal: 200,
  lot_number: "L1",
  expiry_date: "2028-01-01",
  cost_price_override: 12,
  current_selling_price: 20,
};

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

  it("hides Send to vendor without manage_purchase_orders", () => {
    deny("manage_purchase_orders");
    renderDetails(po({ status: "pending" }));
    expect(screen.queryByText("Send to vendor")).toBeNull();
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
    expect(screen.queryAllByText(/Emzor/).length).toBeGreaterThan(0);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "Download PDF" })).not.toBeNull();
  });

  it("offers a named vendor's draft Edit, Send to vendor and Receive stock", () => {
    renderDetails(po({ status: "pending" }));
    const names = screen.getAllByRole("button").map((b) => b.textContent?.trim()).filter(Boolean);
    expect(names).toEqual(expect.arrayContaining(["Edit", "Send to vendor", "Receive stock"]));
  });

  it.each(["pending", "sent", "partially_received", "received", "closed"])(
    "keeps Download PDF in the menu, not the footer, for a %s order",
    (status) => {
      renderDetails(po({ status }));
      expect(screen.queryByRole("button", { name: /Download PDF/ })).toBeNull();
      openMenu();
      expect(screen.queryByRole("menuitem", { name: "Download PDF" })).not.toBeNull();
    },
  );

  it("offers a walk-in draft Receive stock and no Send to vendor, whatever its stored type", () => {
    renderDetails(po({ status: "pending", supplier_id: null, type: "standard" }));
    expect(screen.queryByText("Receive stock")).not.toBeNull();
    expect(screen.queryByText("Send to vendor")).toBeNull();
  });

  it("hides Receive stock on a draft without receive_purchase_orders", () => {
    deny("receive_purchase_orders");
    renderDetails(po({ status: "pending", supplier_id: null }));
    expect(screen.queryByText("Receive stock")).toBeNull();
  });

  it("confirms a draft receipt and receives the saved lines with their lot, expiry and cost", () => {
    onReceiveDraft.mockClear();
    renderDetails(po({ status: "pending", supplier_id: null, items: [draftLine, { ...draftLine, id: "line2", product_name: "Amoxil", bulk_quantity: 0 }] as PurchaseOrder["items"] }));

    fireEvent.click(screen.getByRole("button", { name: "Receive stock" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Amoxil has no quantity and will be left off this receipt");
    expect(onReceiveDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Receive Purchase" }));
    expect(onReceiveDraft).toHaveBeenCalledWith("po1", [
      expect.objectContaining({ po_item_id: "line1", quantity: 2, lot_number: "L1", expiry_date: "2028-01-01", cost_price: 12 }),
      expect.objectContaining({ po_item_id: "line2", quantity: 0 }),
    ]);
  });

  it("sends a receive-only role to the receiving panel for a draft, where uncounted lines can be counted", () => {
    deny("manage_purchase_orders");
    onReceiveGoods.mockClear();
    renderDetails(po({ status: "pending", supplier_id: null, items: [{ ...draftLine, bulk_quantity: 0 }] as PurchaseOrder["items"] }));

    fireEvent.click(screen.getByRole("button", { name: "Receive stock" }));

    expect(onReceiveGoods).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("offers Close short on a partially received order to managers only, behind a confirmation", () => {
    renderDetails(po({ status: "partially_received" }));
    fireEvent.click(screen.getByRole("button", { name: "Close short" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("vendor will not deliver the rest");

    cleanup();
    deny("manage_purchase_orders");
    renderDetails(po({ status: "partially_received" }));
    expect(screen.queryByRole("button", { name: "Close short" })).toBeNull();
  });

  it("shows a closed-short order as locked with no receive action", () => {
    renderDetails(po({ status: "closed" }));
    expect(screen.queryByText("Closed short. The rest of this order will not be delivered.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Receive/ })).toBeNull();
  });

  it("labels a sent order Ordered in its timeline", () => {
    renderDetails(po({ status: "sent" }));
    expect(screen.queryByText("Ordered")).not.toBeNull();
    expect(screen.queryByText("Sent")).toBeNull();
  });

  it("offers Receive Remaining on a partially received order and no deleting", () => {
    renderDetails(po({ status: "partially_received" }));
    expect(screen.queryByText("Receive Remaining")).not.toBeNull();
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /Delete order/ })).toBeNull();
  });

  it("locks a received order with a notice and no receive action", () => {
    renderDetails(po({ status: "received" }));
    expect(screen.queryByText("All items received. This order is now locked.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Receive/ })).toBeNull();
  });
});
