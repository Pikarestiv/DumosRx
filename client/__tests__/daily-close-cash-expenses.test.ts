import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// Daily Close's "Net Cash Expected" is the figure an owner reconciles the drawer against, so it must count exactly the cas…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-daily-close-cash-expenses-test-ts-L9
describe("getCashExpensesForDate", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let finance: typeof import("@/lib/db/queries/finance");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    finance = await import("@/lib/db/queries/finance");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM expenses;`);
    core.setActiveStoreId(null);
  });

  function expense(
    id: string,
    fields: {
      amount: number;
      date: string;
      method?: string | null;
      storeId?: string | null;
      coversMonths?: number | null;
      deleted?: number;
    },
  ) {
    db.run(
      `INSERT INTO expenses (id, category, amount, date, payment_method, store_id, covers_months, _deleted)
       VALUES (?, 'Misc', ?, ?, ?, ?, ?, ?)`,
      [
        id,
        fields.amount,
        fields.date,
        fields.method ?? null,
        fields.storeId ?? null,
        fields.coversMonths ?? null,
        fields.deleted ?? 0,
      ],
    );
  }

  it("sums only cash (and method-less) expenses dated that day", async () => {
    expense("cash", { amount: 1000, date: "2026-10-13", method: "Cash" });
    expense("lower", { amount: 500, date: "2026-10-13", method: "cash" });
    expense("blank", { amount: 250, date: "2026-10-13", method: null });
    expense("transfer", { amount: 9000, date: "2026-10-13", method: "Transfer" });
    expense("card", { amount: 7000, date: "2026-10-13", method: "Card" });
    expense("yesterday", { amount: 4000, date: "2026-10-12", method: "Cash" });
    expense("deleted", {
      amount: 3000,
      date: "2026-10-13",
      method: "Cash",
      deleted: 1,
    });

    expect(await finance.getCashExpensesForDate("2026-10-13")).toBe(1750);
  });

  it("takes a prepaid cash expense out of the till in full, unsmoothed", async () => {
    expense("rent", {
      amount: 1200,
      date: "2026-10-13",
      method: "Cash",
      coversMonths: 12,
    });

    expect(await finance.getCashExpensesForDate("2026-10-13")).toBe(1200);
  });

  it("stays inside the active store", async () => {
    expense("mine", {
      amount: 800,
      date: "2026-10-13",
      method: "Cash",
      storeId: "s1",
    });
    expense("theirs", {
      amount: 600,
      date: "2026-10-13",
      method: "Cash",
      storeId: "s2",
    });

    core.setActiveStoreId("s1");
    expect(await finance.getCashExpensesForDate("2026-10-13")).toBe(800);
  });

  it("is zero, not null, on a day with nothing paid out", async () => {
    expect(await finance.getCashExpensesForDate("2026-10-13")).toBe(0);
  });
});
