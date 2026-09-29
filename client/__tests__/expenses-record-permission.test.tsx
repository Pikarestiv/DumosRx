import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);
let searchParams = new URLSearchParams();

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/expenses",
}));

vi.mock("@/components/auth/require-role", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/dashboard/locked-module-overlay", () => ({
  LockedModuleOverlay: () => null,
}));

vi.mock("@/components/expenses", () => ({
  ExpenseList: () => <div data-testid="expense-list" />,
}));

vi.mock("@/components/expenses/add-expense-dialog", () => ({
  AddExpenseDialog: ({ open }: { open: boolean }) => (
    <div data-testid="add-expense-dialog" data-open={open ? "yes" : "no"} />
  ),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));

vi.mock("@/lib/hooks/use-expense-mutations", () => ({
  useDeleteExpenseMutation: () => ({ mutateAsync: vi.fn() }),
}));

import ExpensesPage from "@/app/(dashboard)/expenses/page";
import { ExpenseDetailDialog } from "@/components/expenses/expense-detail-dialog";

const expense = {
  id: "e1",
  amount: 5000,
  category: "Utilities",
  description: "Diesel",
  date: "2026-09-01",
  payment_method: "Cash",
  recorded_by_name: "Ada",
} as never;

/**
 * "/expenses?action=add" is typeable and is also where the dashboard
 * header's "Add Expense" navigates, so hiding the header action alone would
 * not be a gate - the dialog's own opener has to require record_expenses.
 */
describe("record_expenses gating", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    searchParams = new URLSearchParams();
  });

  it("opens the Add Expense dialog for ?action=add with record_expenses", () => {
    searchParams = new URLSearchParams("action=add");
    render(<ExpensesPage />);
    expect(
      screen.getByTestId("add-expense-dialog").getAttribute("data-open"),
    ).toBe("yes");
  });

  it("withholds the Add Expense dialog for a typed ?action=add without record_expenses", () => {
    hasPermission.mockImplementation((key) => key !== "record_expenses");
    searchParams = new URLSearchParams("action=add");
    render(<ExpensesPage />);
    expect(
      screen.getByTestId("add-expense-dialog").getAttribute("data-open"),
    ).toBe("no");
  });

  it("checks the record_expenses key specifically on the expenses page", () => {
    render(<ExpensesPage />);
    expect(hasPermission).toHaveBeenCalledWith("record_expenses");
  });

  it("shows the expense detail dialog's Edit and Delete with record_expenses", () => {
    render(
      <ExpenseDetailDialog
        expense={expense}
        open
        onOpenChange={vi.fn()}
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
  });

  it("withholds the expense detail dialog's Edit and Delete without record_expenses", () => {
    hasPermission.mockImplementation((key) => key !== "record_expenses");
    render(
      <ExpenseDetailDialog
        expense={expense}
        open
        onOpenChange={vi.fn()}
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });
});
