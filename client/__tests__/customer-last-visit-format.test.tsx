import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Customer } from "@/lib/hooks/use-customer-data";

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { role: "manager" } }),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

import { DirectoryTab } from "@/components/customers/directory-tab";
import { CustomerDesktopRow } from "@/components/customers/customer-list-rows";

const DAY_FIRST_WITH_TIME = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;

const customerVisitedAt = (lastVisit: string): Customer =>
  ({
    id: "c-1",
    name: "Ada Debtor",
    firstName: "Ada",
    lastName: "Debtor",
    email: "ada@example.com",
    phone: "08000000000",
    address: "1 Main St",
    joinDate: "2026-01-01",
    tier: "Gold",
    points: 120,
    totalSpent: 50000,
    lastVisit,
    visitCount: 4,
    birthday: "",
    status: "active",
    outstanding_balance: 7500,
  }) as Customer;

const renderRow = (customer: Customer) =>
  render(
    <CustomerDesktopRow
      customer={customer}
      isSelected={false}
      onSelect={vi.fn()}
      getTierColor={() => "bg-yellow-500"}
      currencyCode="NGN"
      style={{}}
    />,
  );

const renderPanel = (customer: Customer) =>
  render(
    <DirectoryTab
      customers={[customer]}
      searchTerm=""
      onSearchChange={vi.fn()}
      selectedCustomer={customer}
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

describe("customer last visit display", () => {
  it("shows the directory row's last visit as DD/MM/YYYY HH:mm, not the stored ISO instant", () => {
    renderRow(customerVisitedAt("2026-10-24T20:17:00.000Z"));
    expect(screen.getByText(DAY_FIRST_WITH_TIME)).toBeTruthy();
    expect(screen.queryByText(/2026-10-24/)).toBeNull();
  });

  it("shows a dash in the row when the customer has never visited", () => {
    renderRow(customerVisitedAt(""));
    expect(screen.getByText("-")).toBeTruthy();
  });

  it("shows the detail panel's last visit as DD/MM/YYYY HH:mm", () => {
    renderPanel(customerVisitedAt("2026-10-24T20:17:00.000Z"));
    expect(screen.getAllByText(DAY_FIRST_WITH_TIME).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2026-10-24/)).toBeNull();
  });
});
