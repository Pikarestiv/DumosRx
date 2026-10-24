import initSqlJs, { type Database } from "sql.js";

export async function createFinanceReportsDb(): Promise<Database> {
  const core = await import("@/lib/db/core");
  const { SCHEMA_SQL } = await import("@/lib/db/schema");
  const SQL = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
  });
  const db = new SQL.Database();
  db.run(SCHEMA_SQL);
  core.__setDatabaseForTesting(db);
  return db;
}

export async function resetFinanceReportsDb(db: Database): Promise<void> {
  const core = await import("@/lib/db/core");
  core.setActiveStoreId(null);
  db.run(
    `DELETE FROM sales; DELETE FROM sale_items; DELETE FROM expenses; DELETE FROM users;
     DELETE FROM returns; DELETE FROM return_items; DELETE FROM stock_batches;
     DELETE FROM stock_movements;`,
  );
}

export const todayISO = () => new Date().toISOString();

export const otherMonthISO = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return d.toISOString();
};

// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-finance-reports-test-ts-L68
export const currentMonthWindow = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { from, to };
};

// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-finance-reports-test-ts-L77
export const firstDayOfMonthLocal = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
};

// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-helpers-finance-reports-db-ts-todayLocal
export const todayLocal = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const todayLocalMonth = () => todayLocal().slice(0, 7);

// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-helpers-finance-reports-db-ts-todayLocalStartISO
export const todayLocalStartISO = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
};
