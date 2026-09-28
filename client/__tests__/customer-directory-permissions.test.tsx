import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Customer } from "@/lib/hooks/use-customer-data";

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { role: "manager" } }),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

import { DirectoryTab } from "@/components/customers/directory-tab";
import {
  CustomerDesktopRow,
  CUSTOMER_GRID_COLS,
} from "@/components/customers/customer-list-rows";

const customer: Customer = {
  id: "c-1",
  name: "Ada Debtor",
  firstName: "Ada",
  lastName: "Debtor",
  email: "ada@example.com",
  phone: "08000000000",
  address: "1 Main St",
  joinDate: "01/01/2026",
  tier: "Gold",
  points: 120,
  totalSpent: 50000,
  lastVisit: "02/02/2026",
  visitCount: 4,
  birthday: "",
  status: "active",
  outstanding_balance: 7500,
} as Customer;

function renderDirectory(selected: Customer | null = null) {
  return render(
    <DirectoryTab
      customers={[customer]}
      searchTerm=""
      onSearchChange={vi.fn()}
      selectedCustomer={selected}
      setSelectedCustomer={vi.fn()}
      getTierColor={() => "bg-yellow-500"}
      currencyCode="NGN"
      onViewHistory={vi.fn()}
      onEditProfile={vi.fn()}
      onRecordPayment={vi.fn()}
      onAddCustomer={vi.fn()}
      onDeleteCustomer={vi.fn()}
    />,
  );
}

/**
 * The Customers & Loyalty read/write split: manage_customers fronts the
 * add/edit triggers, delete_customers the trash control, and
 * view_customer_balances every place a customer's outstanding debt is
 * shown - the directory's Balance column and debt summary, and the detail
 * panel's outstanding-balance block (which is where Record Payment lives).
 */
describe("customer directory permissions", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the three customer keys specifically", () => {
    renderDirectory();
    expect(hasPermission).toHaveBeenCalledWith("manage_customers");
    expect(hasPermission).toHaveBeenCalledWith("delete_customers");
    expect(hasPermission).toHaveBeenCalledWith("view_customer_balances");
  });

  it("shows the balance column and debt summary with view_customer_balances", () => {
    renderDirectory();
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.getByText(/outstanding across/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Has debt" })).toBeTruthy();
  });

  it("hides the balance column, debt summary and debt filter without view_customer_balances", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "view_customer_balances",
    );
    renderDirectory();
    expect(screen.queryByText("Balance")).toBeNull();
    expect(screen.queryByText(/outstanding across/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Has debt" })).toBeNull();
    expect(screen.getByText("Customer")).toBeTruthy();
    expect(screen.getByText("Points")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Loyalty members" })).toBeTruthy();
  });

  it("shows the detail panel's outstanding balance block with view_customer_balances", () => {
    renderDirectory(customer);
    expect(screen.getByText("Outstanding balance")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record Payment" })).toBeTruthy();
  });

  it("hides the outstanding balance block and Record Payment without view_customer_balances", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "view_customer_balances",
    );
    renderDirectory(customer);
    expect(screen.queryByText("Outstanding balance")).toBeNull();
    expect(screen.queryByRole("button", { name: "Record Payment" })).toBeNull();
    expect(screen.getByRole("button", { name: "View History" })).toBeTruthy();
  });

  it("shows Edit Profile with manage_customers", () => {
    renderDirectory(customer);
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeTruthy();
  });

  it("hides Edit Profile without manage_customers, leaving the record readable", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "manage_customers",
    );
    renderDirectory(customer);
    expect(screen.queryByRole("button", { name: "Edit Profile" })).toBeNull();
    expect(screen.getByRole("button", { name: "View History" })).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
  });

  it("shows the delete control with delete_customers", () => {
    renderDirectory(customer);
    expect(screen.getByTitle("Delete customer")).toBeTruthy();
  });

  it("hides the delete control without delete_customers", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "delete_customers",
    );
    renderDirectory(customer);
    expect(screen.queryByTitle("Delete customer")).toBeNull();
  });

  it("drops the desktop row's balance cell and column with it, keeping the grid in lockstep", () => {
    const { container, rerender } = render(
      <CustomerDesktopRow
        customer={customer}
        isSelected={false}
        onSelect={vi.fn()}
        getTierColor={() => "bg-yellow-500"}
        currencyCode="NGN"
        style={{}}
        showBalance
      />,
    );
    const withBalance = container.firstElementChild as HTMLElement;
    expect(withBalance.className).toContain(CUSTOMER_GRID_COLS.withBalance);
    expect(withBalance.textContent).toContain("7,500");

    rerender(
      <CustomerDesktopRow
        customer={customer}
        isSelected={false}
        onSelect={vi.fn()}
        getTierColor={() => "bg-yellow-500"}
        currencyCode="NGN"
        style={{}}
        showBalance={false}
      />,
    );
    const withoutBalance = container.firstElementChild as HTMLElement;
    expect(withoutBalance.className).toContain(
      CUSTOMER_GRID_COLS.withoutBalance,
    );
    expect(withoutBalance.textContent).not.toContain("7,500");
    expect(withoutBalance.textContent).toContain("Ada Debtor");
  });

  it("hides the empty-state Add Customer action without manage_customers", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "manage_customers",
    );
    render(
      <DirectoryTab
        customers={[]}
        searchTerm=""
        onSearchChange={vi.fn()}
        selectedCustomer={null}
        setSelectedCustomer={vi.fn()}
        getTierColor={() => "bg-gray-400"}
        onAddCustomer={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Add Customer" })).toBeNull();
    expect(screen.getByText("No customers found")).toBeTruthy();
  });
});
