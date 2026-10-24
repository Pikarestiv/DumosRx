import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "manager" } }),
}));

const getExpensesPage = vi.fn(() => Promise.resolve({ rows: [], total: 0 }));
const getExpensesLifetimeTotal = vi.fn(() => Promise.resolve(0));
const getSmoothedExpensesTotal = vi.fn(() => Promise.resolve(0));
const getCurrentMonthExpensesByCategory = vi.fn(() => Promise.resolve([]));

vi.mock("@/lib/db/queries/finance", () => ({
  getCurrentMonthRevenue: vi.fn(),
  getCurrentMonthCOGS: vi.fn(),
  getCurrentMonthExpensesByCategory: (...args: unknown[]) =>
    getCurrentMonthExpensesByCategory(...(args as [])),
  getSmoothedExpensesTotal: (...args: unknown[]) =>
    getSmoothedExpensesTotal(...(args as [])),
  getExpensesPage: (...args: unknown[]) => getExpensesPage(...(args as [])),
  getExpensesLifetimeTotal: (...args: unknown[]) =>
    getExpensesLifetimeTotal(...(args as [])),
  EXPENSES_PAGE_SIZE: 50,
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: undefined,
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => {
    void queryFn();
    return { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
  },
}));

import { useExpenseList, useExpenseTotals } from "@/lib/hooks/use-finance-data";

// The Expenses page has always had an own-vs-all scope; until this pass it hung off view_activity_log (the sales-side key)…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-expenses-view-all-scope-test-tsx-L42
describe("view_all_expenses ledger scoping", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    getExpensesPage.mockClear();
    getExpensesLifetimeTotal.mockClear();
    getSmoothedExpensesTotal.mockClear();
    getCurrentMonthExpensesByCategory.mockClear();
  });

  it("loads every expense with view_all_expenses", () => {
    renderHook(() => useExpenseList());
    expect(getExpensesPage).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: undefined }),
    );
  });

  it("scopes the ledger to the acting user without view_all_expenses", () => {
    hasPermission.mockImplementation((key) => key !== "view_all_expenses");
    renderHook(() => useExpenseList());
    expect(getExpensesPage).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: "u1" }),
    );
  });

  it("does not fall back to view_activity_log for the expense ledger", () => {
    hasPermission.mockImplementation((key) => key === "view_activity_log");
    renderHook(() => useExpenseList());
    expect(getExpensesPage).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: "u1" }),
    );
  });

  it("scopes the lifetime and month figures the same way", () => {
    hasPermission.mockImplementation((key) => key !== "view_all_expenses");
    renderHook(() => useExpenseTotals());
    expect(getExpensesLifetimeTotal).toHaveBeenCalledWith("u1");
    expect(getSmoothedExpensesTotal).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: "u1" }),
    );
    expect(getCurrentMonthExpensesByCategory).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: "u1" }),
    );
  });

  it("leaves the totals unscoped with view_all_expenses", () => {
    renderHook(() => useExpenseTotals());
    expect(getExpensesLifetimeTotal).toHaveBeenCalledWith(undefined);
    expect(getSmoothedExpensesTotal).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: undefined }),
    );
  });
});
