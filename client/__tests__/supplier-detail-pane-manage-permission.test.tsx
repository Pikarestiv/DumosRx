import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * "manage_suppliers" is the add/edit third of the supplier three-way split
 * (view_suppliers reads, delete_suppliers would delete - it has no action
 * to gate, see AGENTS.md). The detail pane keeps every supplier figure
 * visible without it and falls back to the one action the viewer CAN take,
 * "New Order", spanning the row instead of leaving a disabled button.
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { SupplierDetailPane } from "@/components/stock-batch/supplier-detail-pane";
import type { SupplierViewModel } from "@/lib/types/supplier";

const supplier = {
  id: "s1",
  name: "Emzor",
  contactPerson: "Ada",
  phone: "0800",
  email: "a@b.c",
  location: "Lagos",
  rating: 4,
  debtAmount: 1000,
  totalOrders: 3,
  lastOrderDate: null,
  status: "active",
} as unknown as SupplierViewModel;

function renderPane() {
  render(
    <SupplierDetailPane
      selectedSupplier={supplier}
      formatCurrency={(n) => `N${n}`}
      formatDate={() => "01/01/2026"}
      getRatingStars={() => "****"}
      setIsEditDialogOpen={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

describe("Supplier detail pane manage permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the manage_suppliers key", () => {
    renderPane();
    expect(hasPermission).toHaveBeenCalledWith("manage_suppliers");
  });

  it("offers Edit Details with manage_suppliers", () => {
    renderPane();
    expect(screen.queryByText("Edit Details")).not.toBeNull();
  });

  it("hides Edit Details without manage_suppliers but keeps New Order", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "manage_suppliers",
    );
    renderPane();
    expect(screen.queryByText("Edit Details")).toBeNull();
    expect(screen.queryByText("New Order")).not.toBeNull();
  });

  it("still shows the supplier's own details without manage_suppliers", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "manage_suppliers",
    );
    renderPane();
    expect(screen.queryByText("Emzor")).not.toBeNull();
  });
});
