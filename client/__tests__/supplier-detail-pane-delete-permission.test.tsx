import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/suppliers/supplier-delete-dialog", () => ({
  SupplierDeleteDialog: ({ target }: { target: unknown }) =>
    target ? <div data-testid="supplier-delete-dialog" /> : null,
}));

import { SupplierDetailPane } from "@/components/stock-batch/supplier-detail-pane";
import type { SupplierViewModel } from "@/lib/types/supplier";

const supplier: SupplierViewModel = {
  id: "v1",
  name: "Emzor Pharmaceuticals",
  contactPerson: "Ada",
  email: "ada@emzor.test",
  phone: "08000000000",
  address: "Lagos",
  status: "active",
  totalOrders: 3,
  totalValue: 90000,
  lastOrderDate: "2026-09-01",
  paymentTerms: "30",
  rating: 4.5,
  hasDebt: false,
  debtAmount: 0,
};

function renderPane(overrides: Partial<SupplierViewModel> = {}) {
  render(
    <SupplierDetailPane
      selectedSupplier={{ ...supplier, ...overrides }}
      formatCurrency={(n) => String(n)}
      formatDate={(d) => d}
      getRatingStars={() => "★★★★☆"}
      setIsEditDialogOpen={vi.fn()}
    />,
  );
}

describe("Supplier detail pane delete-supplier permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers Delete Supplier to a user with delete_suppliers", () => {
    renderPane();
    expect(screen.getByRole("button", { name: /Delete Supplier/ })).toBeTruthy();
  });

  it("hides Delete Supplier from a user without delete_suppliers", () => {
    hasPermission.mockImplementation((key: string) => key !== "delete_suppliers");
    renderPane();
    expect(screen.queryByRole("button", { name: /Delete Supplier/ })).toBeNull();
  });

  it("keeps Edit Details and New Order without delete_suppliers", () => {
    hasPermission.mockImplementation((key: string) => key !== "delete_suppliers");
    renderPane();
    expect(screen.getByRole("button", { name: /Edit Details/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /New Order/ })).toBeTruthy();
  });

  it("offers Delete Supplier without manage_suppliers", () => {
    hasPermission.mockImplementation((key: string) => key !== "manage_suppliers");
    renderPane();
    expect(screen.queryByRole("button", { name: /Edit Details/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Delete Supplier/ })).toBeTruthy();
  });

  it("checks the delete_suppliers key specifically", () => {
    renderPane();
    expect(hasPermission).toHaveBeenCalledWith("delete_suppliers");
  });

  it("opens the confirmation dialog rather than deleting on click", () => {
    renderPane();
    expect(screen.queryByTestId("supplier-delete-dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Delete Supplier/ }));
    expect(screen.getByTestId("supplier-delete-dialog")).toBeTruthy();
  });
});
