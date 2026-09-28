import { describe, it, expect } from "vitest";
import { deriveExpenseStats } from "@/lib/hooks/use-expenses-page";
import type { Expense } from "@/lib/db/queries/finance";

/**
 * The Expenses page's four derived figures used to be recomputed on every
 * render, with getSmoothedAmountInWindow() called twice per expense across two
 * separate reduce passes. Folding them into one memoized pass is only safe if
 * it produces identical numbers, so this pins the arithmetic - in particular
 * that the lifetime total is NOT smoothed while "this month" and the category
 * breakdown are.
 */
function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    category: "Rent",
    amount: 100,
    date: "2026-03-10",
    description: "",
    ...overrides,
  } as Expense;
}

const MONTH_START = new Date(2026, 2, 1);
const MONTH_END = new Date(2026, 3, 1);

describe("deriveExpenseStats", () => {
  it("returns zeros and N/A for no expenses", () => {
    const stats = deriveExpenseStats([], MONTH_START, MONTH_END);
    expect(stats.totalExpenses).toBe(0);
    expect(stats.thisMonthExpenses).toBe(0);
    expect(stats.topCategoryStr).toBe("N/A");
  });

  it("sums the lifetime total unsmoothed, across every month", () => {
    const stats = deriveExpenseStats(
      [
        expense({ id: "a", amount: 100, date: "2026-03-10" }),
        expense({ id: "b", amount: 250, date: "2025-11-02" }),
      ],
      MONTH_START,
      MONTH_END,
    );
    expect(stats.totalExpenses).toBe(350);
  });

  it("counts only this month's smoothed share in thisMonthExpenses", () => {
    const stats = deriveExpenseStats(
      [
        expense({ id: "a", amount: 100, date: "2026-03-10" }),
        expense({ id: "b", amount: 90, date: "2025-11-02" }),
      ],
      MONTH_START,
      MONTH_END,
    );
    expect(stats.totalExpenses).toBe(190);
    expect(stats.thisMonthExpenses).toBe(100);
  });

  it("spreads a prepaid expense across its covered months", () => {
    // Logged in January, covering three months: only one third lands in March.
    const stats = deriveExpenseStats(
      [
        expense({
          id: "a",
          amount: 300,
          date: "2026-01-15",
          covers_months: 3,
        } as Partial<Expense>),
      ],
      MONTH_START,
      MONTH_END,
    );
    expect(stats.totalExpenses).toBe(300);
    expect(stats.thisMonthExpenses).toBeCloseTo(100);
    expect(stats.categoryTotals.Rent).toBeCloseTo(100);
  });

  it("picks the largest category of the month, ignoring categories with no share this month", () => {
    const stats = deriveExpenseStats(
      [
        expense({ id: "a", category: "Rent", amount: 100, date: "2026-03-10" }),
        expense({
          id: "b",
          category: "Salaries",
          amount: 400,
          date: "2026-03-11",
        }),
        expense({
          id: "c",
          category: "Marketing",
          amount: 900,
          date: "2025-01-05",
        }),
      ],
      MONTH_START,
      MONTH_END,
    );
    expect(stats.topCategoryStr).toBe("Salaries");
    expect(stats.categoryTotals.Marketing).toBeUndefined();
  });
});
