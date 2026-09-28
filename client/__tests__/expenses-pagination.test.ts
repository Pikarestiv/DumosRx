import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * getAllExpenses() read the whole expenses table - a table that grows every
 * day for the life of the store - and the Expenses page then filtered and
 * reduced all of it client-side. The list is now read a page at a time, and the
 * lifetime total it displays comes from a SQL SUM so it stays correct no matter
 * how much of the list has been loaded.
 */
describe("expenses paging", () => {
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
    db.run(`DELETE FROM expenses; DELETE FROM users;`);
    core.setActiveStoreId(null);
  });

  function seed(count: number, userId = "u1", amount = 100) {
    db.run(
      `INSERT OR IGNORE INTO users (id, first_name, last_name) VALUES (?, 'Ada', 'Obi')`,
      [userId],
    );
    for (let i = 0; i < count; i += 1) {
      const day = String((i % 28) + 1).padStart(2, "0");
      db.run(
        `INSERT INTO expenses (id, category, amount, date, user_id, _deleted)
         VALUES (?, 'Rent', ?, ?, ?, 0)`,
        [`e${i}`, amount, `2026-03-${day}`, userId],
      );
    }
  }

  describe("getExpensesPage", () => {
    it("returns at most `limit` rows and reports the full row count", async () => {
      seed(25);

      const page = await finance.getExpensesPage({ limit: 10, offset: 0 });
      expect(page.rows).toHaveLength(10);
      expect(page.total).toBe(25);
    });

    it("walks the list without repeating or skipping a row", async () => {
      seed(25);

      const first = await finance.getExpensesPage({ limit: 10, offset: 0 });
      const second = await finance.getExpensesPage({ limit: 10, offset: 10 });
      const third = await finance.getExpensesPage({ limit: 10, offset: 20 });

      const ids = [...first.rows, ...second.rows, ...third.rows].map((r) => r.id);
      expect(third.rows).toHaveLength(5);
      expect(new Set(ids).size).toBe(25);
    });

    it("still joins the recorder's display name and honours viewer scoping", async () => {
      db.run(
        `INSERT INTO users (id, first_name, last_name) VALUES ('u1', 'Ada', 'Obi'), ('u2', 'Bo', 'Lee')`,
      );
      db.run(
        `INSERT INTO expenses (id, category, amount, date, user_id, _deleted) VALUES
          ('e1', 'Rent', 1000, '2026-03-01', 'u1', 0),
          ('e2', 'Rent', 2000, '2026-03-02', 'u2', 0)`,
      );

      const mine = await finance.getExpensesPage({ viewerId: "u1", limit: 50 });
      expect(mine.total).toBe(1);
      expect(mine.rows[0]).toMatchObject({ id: "e1", recorded_by_name: "Ada Obi" });

      const everyone = await finance.getExpensesPage({ limit: 50 });
      expect(everyone.total).toBe(2);
    });

    it("filters by description in SQL, across the whole ledger", async () => {
      db.run(
        `INSERT INTO expenses (id, category, amount, date, description, _deleted) VALUES
          ('e1', 'Rent', 1000, '2026-03-01', 'Generator diesel', 0),
          ('e2', 'Rent', 2000, '2026-03-02', 'Office rent', 0)`,
      );

      const page = await finance.getExpensesPage({ search: "diesel" });
      expect(page.rows.map((r) => r.id)).toEqual(["e1"]);
      expect(page.total).toBe(1);
    });

    it("matches a description search regardless of case", async () => {
      db.run(
        `INSERT INTO expenses (id, category, amount, date, description, _deleted)
         VALUES ('e1', 'Rent', 1000, '2026-03-01', 'Generator Diesel', 0)`,
      );

      const page = await finance.getExpensesPage({ search: "diesel" });
      expect(page.rows).toHaveLength(1);
    });

    it("filters by category, treating All as no filter", async () => {
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES
          ('e1', 'Rent', 1000, '2026-03-01', 0),
          ('e2', 'Utilities', 2000, '2026-03-02', 0)`,
      );

      expect(
        (await finance.getExpensesPage({ category: "Utilities" })).rows.map((r) => r.id),
      ).toEqual(["e2"]);
      expect((await finance.getExpensesPage({ category: "All" })).total).toBe(2);
    });

    it("returns an empty page rather than failing when there are no expenses", async () => {
      const page = await finance.getExpensesPage({ limit: 10 });
      expect(page.rows).toEqual([]);
      expect(page.total).toBe(0);
    });
  });

  describe("getExpensesLifetimeTotal", () => {
    it("sums every expense in SQL, not just the loaded page", async () => {
      seed(25, "u1", 100);

      const page = await finance.getExpensesPage({ limit: 10 });
      const total = await finance.getExpensesLifetimeTotal();

      expect(page.rows).toHaveLength(10);
      expect(total).toBe(2500);
    });

    it("scopes to one viewer when asked", async () => {
      db.run(
        `INSERT INTO users (id, first_name, last_name) VALUES ('u1', 'Ada', 'Obi'), ('u2', 'Bo', 'Lee')`,
      );
      db.run(
        `INSERT INTO expenses (id, category, amount, date, user_id, _deleted) VALUES
          ('e1', 'Rent', 1000, '2026-03-01', 'u1', 0),
          ('e2', 'Rent', 2000, '2026-03-02', 'u2', 0)`,
      );

      expect(await finance.getExpensesLifetimeTotal("u1")).toBe(1000);
      expect(await finance.getExpensesLifetimeTotal()).toBe(3000);
    });

    it("is zero, not null, with no expenses at all", async () => {
      expect(await finance.getExpensesLifetimeTotal()).toBe(0);
    });

    it("ignores soft-deleted expenses", async () => {
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES
          ('e1', 'Rent', 1000, '2026-03-01', 0),
          ('e2', 'Rent', 9999, '2026-03-02', 1)`,
      );
      expect(await finance.getExpensesLifetimeTotal()).toBe(1000);
    });
  });
});
