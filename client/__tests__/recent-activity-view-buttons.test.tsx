import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }),
}));

vi.mock("@/lib/db/procurement", () => ({
  getPurchaseOrderItemsForDetail: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/db/queries/prescriptions", () => ({
  getPrescriptionItems: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/db/queries/products", () => ({
  getProductBasicInfo: vi.fn(() => Promise.resolve({ name: "Panadol" })),
}));

import { ProcurementDetailsDialog } from "@/components/dashboard/modals/procurement-details-dialog";
import { DashboardPrescriptionDetailsDialog } from "@/components/dashboard/modals/dashboard-prescription-details-dialog";
import { StockMovementDetailsDialog } from "@/components/dashboard/modals/stock-movement-details-dialog";
import { ExpenseDetailsDialog } from "@/components/dashboard/modals/expense-details-dialog";
import { PrescriptionActions } from "@/components/prescriptions/new-prescription/prescription-actions";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("Recent activity detail sheet View buttons", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("navigates to the purchase order when View Order is clicked", () => {
    const onOpenChange = vi.fn();
    wrap(
      <ProcurementDetailsDialog
        po={{
          id: "po-123",
          order_number: "PO-123",
          supplier_id: null,
          status: "pending",
          type: "immediate",
          total_amount: 5000,
          created_at: "2026-11-22T08:00:00Z",
          vendor_name: "Walk-in",
          payment_status: "unpaid",
          amount_paid: 0,
        }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /view order/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(pushMock).toHaveBeenCalledWith("/procurement?selected=po-123");
  });

  it("navigates to prescriptions when View Prescription is clicked", () => {
    const onOpenChange = vi.fn();
    wrap(
      <DashboardPrescriptionDetailsDialog
        prescription={{
          id: "rx-456",
          prescription_number: "RX-456",
          patient_name: "Ada",
          status: "pending",
          priority: "normal",
          created_at: "2026-11-22T08:00:00Z",
          total_cost: 2000,
        }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /view prescription/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(pushMock).toHaveBeenCalledWith("/prescriptions?selected=rx-456");
  });

  it("navigates to stock movements when View Movement is clicked", () => {
    const onOpenChange = vi.fn();
    wrap(
      <StockMovementDetailsDialog
        movement={{
          id: "mv-789",
          product_id: "p1",
          movement_type: "sale",
          quantity: -2,
          created_at: "2026-11-22T08:00:00Z",
        }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /view movement/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(pushMock).toHaveBeenCalledWith("/inventory/ledger?selected=mv-789");
  });

  it("navigates to expenses when View Expense is clicked", () => {
    const onOpenChange = vi.fn();
    wrap(
      <ExpenseDetailsDialog
        expense={{
          id: "exp-101",
          category: "utilities",
          amount: 4500,
          payment_method: "cash",
          date: "2026-11-22",
          created_at: "2026-11-22T08:00:00Z",
          description: "Diesel",
        }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /view expense/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(pushMock).toHaveBeenCalledWith("/expenses?selected=exp-101");
  });
});

describe("PrescriptionActions Clear Form button", () => {
  it("stretches to fill remaining width beside Create Prescription with destructive styling", () => {
    render(
      <PrescriptionActions isEditing={false} resetForm={vi.fn()} cancelEdit={vi.fn()} />,
    );

    const clearBtn = screen.getByRole("button", { name: "Clear Form" });
    expect(clearBtn.className).toContain("flex-1");
    expect(clearBtn.className).toContain("bg-destructive");
  });
});
