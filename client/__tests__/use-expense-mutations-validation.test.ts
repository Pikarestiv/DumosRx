import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { ReactNode } from "react";
import React from "react";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for docs/KNOWN_BUGS.md's "Expense amount has no
 * numeric validation": parseFloat(formData.amount) could store NaN for a
 * non-numeric input, nothing rejected a negative amount, and nothing rounded
 * to the cent before writing into expenses.amount (a REAL column).
 */
describe("expense amount validation and rounding", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useSaveExpenseMutation: typeof import("@/lib/hooks/use-expense-mutations").useSaveExpenseMutation;
  let useQuickEditExpenseMutation: typeof import("@/lib/hooks/use-expense-mutations").useQuickEditExpenseMutation;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const mutations = await import("@/lib/hooks/use-expense-mutations");
    useSaveExpenseMutation = mutations.useSaveExpenseMutation;
    useQuickEditExpenseMutation = mutations.useQuickEditExpenseMutation;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM expenses;`);
  });

  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient();
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  it("rejects a non-numeric amount instead of storing NaN", async () => {
    const { result } = renderHook(() => useSaveExpenseMutation(), { wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          formData: {
            category: "Rent",
            amount: "not-a-number",
            description: "",
            date: "2026-09-22",
            payment_method: "Cash",
            notes: "",
            covers_months: "",
          },
        });
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    const rows = db.exec(`SELECT COUNT(*) FROM expenses`);
    expect(rows[0].values[0][0]).toBe(0);
  });

  it("rejects a negative amount", async () => {
    const { result } = renderHook(() => useSaveExpenseMutation(), { wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          formData: {
            category: "Rent",
            amount: "-50",
            description: "",
            date: "2026-09-22",
            payment_method: "Cash",
            notes: "",
            covers_months: "",
          },
        });
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
  });

  it("rounds a float-drift-prone amount to the cent on write", async () => {
    const { result } = renderHook(() => useSaveExpenseMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        formData: {
          category: "Rent",
          amount: "19.999999999999996", // realistic float-arithmetic residue
          description: "",
          date: "2026-09-22",
          payment_method: "Cash",
          notes: "",
          covers_months: "",
        },
        userId: "user-1",
      });
    });

    await waitFor(() => {
      const rows = db.exec(`SELECT amount FROM expenses`);
      expect(rows[0].values[0][0]).toBe(20);
    });
  });

  it("quick-edit rejects a non-positive amount", async () => {
    db.run(`INSERT INTO expenses (id, category, amount, date) VALUES ('e1', 'Rent', 100, '2026-09-22')`);
    const { result } = renderHook(() => useQuickEditExpenseMutation(), { wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: "e1", amount: 0, category: "Rent" });
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    const rows = db.exec(`SELECT amount FROM expenses WHERE id = 'e1'`);
    expect(rows[0].values[0][0]).toBe(100); // unchanged
  });

  it("quick-edit rounds to the cent on write", async () => {
    db.run(`INSERT INTO expenses (id, category, amount, date) VALUES ('e2', 'Rent', 100, '2026-09-22')`);
    const { result } = renderHook(() => useQuickEditExpenseMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "e2", amount: 19.999999999999996, category: "Rent" });
    });

    await waitFor(() => {
      const rows = db.exec(`SELECT amount FROM expenses WHERE id = 'e2'`);
      expect(rows[0].values[0][0]).toBe(20);
    });
  });
});
