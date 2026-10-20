import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));

describe("useDailyCloseData reseller commission profit adjustment", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useDailyCloseData: typeof import("@/lib/hooks/use-daily-close-data").useDailyCloseData;

  const reportDate = "2026-09-18";

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    useDailyCloseData = (await import("@/lib/hooks/use-daily-close-data"))
      .useDailyCloseData;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM sales; DELETE FROM sale_items; DELETE FROM returns; DELETE FROM return_items; DELETE FROM payment_accounts;`,
    );
    core.setActiveStoreId(null);
  });

  function renderData() {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    return renderHook(() => useDailyCloseData(reportDate), { wrapper });
  }

  it("counts the full markup as profit while the reseller commission is still pending", async () => {
    // Cost 100, sold at 270 (normal profit 100 + markup 70), not yet redeemed.
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, transaction_date, is_reseller_sale, reseller_markup_amount, reseller_commission_amount, reseller_commission_redeemed)
      VALUES ('s1', 'TXN1', 270, 270, 'cash', '2026-09-18T10:00:00.000Z', 1, 70, 50, 0)
    `);
    db.run(`
      INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
      VALUES ('si1', 's1', 'p1', 1, 270, 100, 270)
    `);

    const { result } = renderData();
    await waitFor(() => expect(result.current.salesToday.length).toBe(1));

    expect(result.current.totalProfit).toBe(170);
  });

  it("subtracts the redeemed commission amount from profit once claimed (100 base + 70 markup - 50 redeemed = 120)", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, transaction_date, is_reseller_sale, reseller_markup_amount, reseller_commission_amount, reseller_commission_redeemed, reseller_commission_redeemed_amount, reseller_commission_claim_type)
      VALUES ('s2', 'TXN2', 270, 270, 'cash', '2026-09-18T10:00:00.000Z', 1, 70, 50, 1, 50, 'commission')
    `);
    db.run(`
      INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
      VALUES ('si2', 's2', 'p1', 1, 270, 100, 270)
    `);

    const { result } = renderData();
    await waitFor(() => expect(result.current.salesToday.length).toBe(1));

    expect(result.current.totalProfit).toBe(120);
  });

  it("keeps the full markup as profit when the store claims it instead of paying a commission", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, transaction_date, is_reseller_sale, reseller_markup_amount, reseller_commission_amount, reseller_commission_redeemed, reseller_commission_redeemed_amount, reseller_commission_claim_type)
      VALUES ('s3', 'TXN3', 270, 270, 'cash', '2026-09-18T10:00:00.000Z', 1, 70, 50, 1, 0, 'store_claim')
    `);
    db.run(`
      INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
      VALUES ('si3', 's3', 'p1', 1, 270, 100, 270)
    `);

    const { result } = renderData();
    await waitFor(() => expect(result.current.salesToday.length).toBe(1));

    // 270 - 100 cost - 0 paid out = 170: the store keeps the whole markup
    // since nothing was actually paid to a reseller.
    expect(result.current.totalProfit).toBe(170);
  });
});

// The commission is a RATE multiplication - the A-261 class, not float dust - and it is both stored and paid out to a rese…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-daily-close-reseller-profit-test-ts-L102
describe("reseller commission is stored at two decimals", () => {
  it("rounds a commission that does not divide evenly", async () => {
    const { computeResellerCommission } = await import(
      "@/lib/hooks/use-pos-payment-helpers"
    );
    const { resellerMarkup, resellerCommissionAmount } = computeResellerCommission({
      cart: [
        { unit_price: 1234.5, original_unit_price: 1000, quantity: 1 },
      ] as Parameters<typeof computeResellerCommission>[0]["cart"],
      isResellerSale: true,
      markupType: "reseller",
      resellerCommissionPercentage: 12.5,
    });
    expect(resellerMarkup).toBe(234.5);
    // 234.5 * 0.125 = 29.3125
    expect(resellerCommissionAmount).toBe(29.31);
  });
});
