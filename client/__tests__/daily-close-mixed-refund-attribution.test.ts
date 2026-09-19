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

/**
 * Regression: a refund of a mixed-payment sale unconditionally deducted the
 * full refunded amount from daily close's cash total, regardless of what
 * the original sale was actually paid with. A sale split card 7000 / cash
 * 3000, refunded in full, previously understated expected cash by 7000
 * that was never in the drawer to begin with (it came off a card), and
 * didn't touch the card total at all. The original sale's own
 * payment_details.splits (already joined onto each return row by
 * getDailyCloseData) now prorates the refund across the non-credit splits
 * it actually reflects - a credit split is excluded entirely, since
 * refunding it writes off a receivable rather than moving drawer cash.
 */
describe("useDailyCloseData mixed-payment refund attribution", () => {
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

  it("prorates a full refund of a mixed sale across its actual cash/card split, not all from cash", async () => {
    const paymentDetails = JSON.stringify({
      splits: [
        { method: "cash", amount: 3000 },
        { method: "card", amount: 7000 },
      ],
    });
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, payment_details, transaction_date)
       VALUES ('s1', 'TXN1', 10000, 10000, 'mixed', ?, '2026-09-18T10:00:00.000Z')`,
      [paymentDetails],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
       VALUES ('si1', 's1', 'p1', 1, 10000, 5000, 10000)`,
    );
    db.run(
      `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at)
       VALUES ('r1', 's1', 'u1', 10000, '2026-09-18T11:00:00.000Z')`,
    );

    const { result } = renderData();
    await waitFor(() => expect(result.current.salesToday.length).toBe(1));
    await waitFor(() => expect(result.current.returnsToday.length).toBe(1));

    // Sale contributed cash 3000 / card 7000. Full refund should reverse
    // exactly that, not dump all 10000 out of cash.
    expect(result.current.aggregatedTotals.cash).toBe(0);
    expect(result.current.aggregatedTotals.card).toBe(0);
  });

  it("reduces credit extended-today proportionally too, consistent with how a pure-credit refund already works", async () => {
    const paymentDetails = JSON.stringify({
      splits: [
        { method: "cash", amount: 3000 },
        { method: "credit", amount: 7000 },
      ],
    });
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, payment_details, transaction_date)
       VALUES ('s1', 'TXN1', 10000, 10000, 'mixed', ?, '2026-09-18T10:00:00.000Z')`,
      [paymentDetails],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
       VALUES ('si1', 's1', 'p1', 1, 10000, 5000, 10000)`,
    );
    // A full refund, including forgiving the 7000 credit debt.
    db.run(
      `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at)
       VALUES ('r1', 's1', 'u1', 10000, '2026-09-18T11:00:00.000Z')`,
    );

    const { result } = renderData();
    await waitFor(() => expect(result.current.salesToday.length).toBe(1));
    await waitFor(() => expect(result.current.returnsToday.length).toBe(1));

    // The full 10000 refund reverses the original 3000 cash / 7000 credit
    // split exactly, the same as a pure-credit sale's refund already
    // reduces `credit` - forgiving the 7000 credit debt shows up there,
    // not as a phantom cash movement.
    expect(result.current.aggregatedTotals.cash).toBe(0);
    expect(result.current.aggregatedTotals.credit).toBe(0);
  });

  it("prorates a partial refund proportionally across the original split", async () => {
    const paymentDetails = JSON.stringify({
      splits: [
        { method: "cash", amount: 6000 },
        { method: "card", amount: 4000 },
      ],
    });
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, payment_details, transaction_date)
       VALUES ('s1', 'TXN1', 10000, 10000, 'mixed', ?, '2026-09-18T10:00:00.000Z')`,
      [paymentDetails],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
       VALUES ('si1', 's1', 'p1', 1, 10000, 5000, 10000)`,
    );
    // A partial refund of half the sale.
    db.run(
      `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at)
       VALUES ('r1', 's1', 'u1', 5000, '2026-09-18T11:00:00.000Z')`,
    );

    const { result } = renderData();
    await waitFor(() => expect(result.current.salesToday.length).toBe(1));
    await waitFor(() => expect(result.current.returnsToday.length).toBe(1));

    // 60/40 split of the 5000 refund: cash -3000, card -2000.
    expect(result.current.aggregatedTotals.cash).toBe(3000);
    expect(result.current.aggregatedTotals.card).toBe(2000);
  });
});
