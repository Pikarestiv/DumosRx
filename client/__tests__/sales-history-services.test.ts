import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("sales history counts and names service lines (A-365)", () => {
  let db: Database;
  let sales: typeof import("@/lib/db/queries/sales");
  const saleInstant = new Date(2026, 8, 1, 10, 0, 0, 0).toISOString();

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    sales = await import("@/lib/db/queries/sales");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(null);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM sales; DELETE FROM sale_items; DELETE FROM sale_services;`);
    db.run(`INSERT INTO products (id, name, selling_price, is_active, _deleted) VALUES ('p1', 'Body Lotion', 3000, 1, 0)`);
  });

  function seedSale(id: string, reseller = 0) {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, created_at, is_reseller_sale, _deleted)
       VALUES (?, ?, 0, 0, ?, ?, ?, 0)`,
      [id, `TXN-${id}`, saleInstant, saleInstant, reseller],
    );
  }

  function seedService(id: string, saleId: string, name: string, quantity: number, deleted = 0) {
    db.run(
      `INSERT INTO sale_services (id, sale_id, service_name, quantity, unit_price, total_price, _deleted) VALUES (?, ?, ?, ?, 1000, 1000, ?)`,
      [id, saleId, name, quantity, deleted],
    );
  }

  function seedItem(id: string, saleId: string, quantity: number) {
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, _deleted) VALUES (?, ?, 'p1', ?, 3000, 2000, 6000, 0)`,
      [id, saleId, quantity],
    );
  }

  const names = (value: unknown) => String(value).split("||").sort();

  it("counts and names a services-only sale in Recent Sales, ignoring a voided service", async () => {
    seedSale("s1");
    seedService("ss1", "s1", "Consultation", 1);
    seedService("ss2", "s1", "Dressing", 2);
    seedService("ss3", "s1", "Voided Scan", 4, 1);

    const row = (await sales.getRecentSales()).find((r) => r.id === "s1");

    expect(row?.item_count).toBe(3);
    expect(names(row?.item_names)).toEqual(["Consultation", "Dressing"]);
  });

  it("adds product units and service units together on a mixed sale", async () => {
    seedSale("s2");
    seedItem("si1", "s2", 2);
    seedService("ss4", "s2", "Massage", 1);

    const row = (await sales.getRecentSales()).find((r) => r.id === "s2");

    expect(row?.item_count).toBe(3);
    expect(names(row?.item_names)).toEqual(["Body Lotion", "Massage"]);
    expect((await sales.getSaleById("s2"))?.item_count).toBe(3);
    expect((await sales.getSaleByTransactionNumber("TXN-s2"))?.item_count).toBe(3);
  });

  it("counts a services-only sale looked up by id or transaction number", async () => {
    seedSale("s3");
    seedService("ss5", "s3", "Consultation", 2);

    expect((await sales.getSaleById("s3"))?.item_count).toBe(2);
    expect((await sales.getSaleByTransactionNumber("TXN-s3"))?.item_count).toBe(2);
  });

  it("names service lines on a reseller commission sale", async () => {
    seedSale("s4", 1);
    seedItem("si2", "s4", 1);
    seedService("ss6", "s4", "Fitting", 1);

    const row = (await sales.getResellerCommissionSales()).find((r) => r.id === "s4");

    expect(names(row?.item_names)).toEqual(["Body Lotion", "Fitting"]);
  });

  it("leaves a sale with no lines at zero items and no names", async () => {
    seedSale("s5");

    const row = (await sales.getRecentSales()).find((r) => r.id === "s5");

    expect(row?.item_count).toBe(0);
    expect(row?.item_names ?? null).toBeNull();
  });

  it("names service lines on the Daily Close sales list so a service search finds the sale", async () => {
    seedSale("s6");
    seedService("ss6", "s6", "Consultation", 1);
    seedService("ss7", "s6", "Voided Scan", 1, 1);
    seedSale("s7");
    seedItem("si7", "s7", 1);
    seedService("ss8", "s7", "Fitting", 1);

    const { salesToday } = await sales.getDailyCloseData("2026-09-01");
    const byId = new Map(salesToday.map((s) => [s.id, s]));

    expect(names(byId.get("s6")?.item_names)).toEqual(["Consultation"]);
    expect(names(byId.get("s7")?.item_names)).toEqual(["Body Lotion", "Fitting"]);
  });
});
