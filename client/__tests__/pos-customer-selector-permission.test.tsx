import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/db/local-database", () => ({
  insert: vi.fn(),
}));

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: true,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

import { POSCustomerSelector } from "@/components/pos/pos-customer-selector";

function renderSelector() {
  render(
    <POSCustomerSelector
      selectedCustomer={null}
      customers={[]}
      loadingCustomers={false}
      onSelectCustomer={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Walk-in customer"));
}

/**
 * The till's own "Add new customer" inline form writes a customers row, so
 * it is the same manage_customers right as the Customers page's Add
 * Customer - not a separate "at the till" concession. sales_staff holds the
 * key by default, so gating it changes nothing for a cashier.
 */
describe("POS customer selector add permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers Add new customer with manage_customers", () => {
    renderSelector();
    expect(screen.getByText("Add new customer")).toBeTruthy();
  });

  it("withholds Add new customer without manage_customers, leaving search and selection", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "manage_customers",
    );
    renderSelector();
    expect(screen.queryByText("Add new customer")).toBeNull();
    expect(
      screen.getByLabelText("Search customers by name or phone number"),
    ).toBeTruthy();
  });

  it("checks the manage_customers key specifically", () => {
    renderSelector();
    expect(hasPermission).toHaveBeenCalledWith("manage_customers");
  });
});
