import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import {
  deriveSaleStockOwedStatus,
  getSaleStockReconciliation,
} from "@/lib/db/queries/backorders";
import { getRecentSales, getTransactionDetails } from "@/lib/db/queries/sales";
import {
  ADJUSTMENT_REASON_NOTE_SEPARATOR,
  BACKORDER_REASON,
  BACKORDER_REFERENCE_TYPE,
  BACKORDER_SETTLEMENT_REASON,
  BACKORDER_SETTLEMENT_REFERENCE_TYPE,
} from "@/lib/constants/stock-adjustments";

describe("deriveSaleStockOwedStatus", () => {
  it("derives correct status across lifecycle", () => {
    expect(deriveSaleStockOwedStatus(0, 0)).toBe("none");
    expect(deriveSaleStockOwedStatus(5, 0)).toBe("open");
    expect(deriveSaleStockOwedStatus(5, 2)).toBe("partial");
    expect(deriveSaleStockOwedStatus(5, 5)).toBe("settled");
    expect(deriveSaleStockOwedStatus(5, 7)).toBe("settled");
  });
});

describe("Sale stock reconciliation & getRecentSales tell-tales", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM stock_movements; DELETE FROM sale_items; DELETE FROM sales; DELETE FROM products;");
    core.setActiveStoreId(null);
  });

  it("reconciles a sale with backorder shortfall and subsequent PO settlement", async () => {
    db.run(`INSERT INTO products (id, name, selling_price, _deleted) VALUES ('p1', 'Paracetamol', 100, 0);`);
    db.run(
      `INSERT INTO sales (id, transaction_number, user_id, subtotal, total_amount, payment_method, created_at, _deleted)
       VALUES ('sale-1', 'REC-1001', 'u1', 500, 500, 'cash', '2026-11-06T10:00:00.000Z', 0);`,
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, _deleted)
       VALUES ('si-1', 'sale-1', 'p1', 5, 100, 500, 0);`,
    );

    // Initial shortfall of 3 units
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, reference_id, reference_type, reason, movement_date, _deleted)
       VALUES ('sm-1', 'p1', 'b1', 'adjustment', 3, 'sale-1', ?, ?, '2026-11-06T10:00:00.000Z', 0);`,
      [BACKORDER_REFERENCE_TYPE, BACKORDER_REASON],
    );

    // Check reconciliation before settlement (open)
    const reconBefore = await getSaleStockReconciliation("sale-1");
    expect(reconBefore.originallyOwed).toBe(3);
    expect(reconBefore.settled).toBe(0);
    expect(reconBefore.outstanding).toBe(3);
    expect(reconBefore.status).toBe("open");
    expect(reconBefore.byProduct?.p1?.originallyOwed).toBe(3);
    expect(reconBefore.byProduct?.p1?.outstanding).toBe(3);

    // getRecentSales reflects 3 owed, 0 settled
    const recentBefore = await getRecentSales();
    expect(recentBefore[0]?.stock_originally_owed).toBe(3);
    expect(recentBefore[0]?.stock_settled).toBe(0);

    // Partial settlement of 1 unit via PO-999
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, unit_cost, reference_id, reference_type, reason, movement_date, _deleted)
       VALUES ('sm-2', 'p1', 'b1', 'adjustment', -1, 55, 'sale-1', ?, ?, '2026-11-06T12:00:00.000Z', 0);`,
      [BACKORDER_SETTLEMENT_REFERENCE_TYPE, `${BACKORDER_SETTLEMENT_REASON}${ADJUSTMENT_REASON_NOTE_SEPARATOR}PO-999`],
    );

    const reconPartial = await getSaleStockReconciliation("sale-1");
    expect(reconPartial.originallyOwed).toBe(3);
    expect(reconPartial.settled).toBe(1);
    expect(reconPartial.outstanding).toBe(2);
    expect(reconPartial.status).toBe("partial");
    expect(reconPartial.settlements).toHaveLength(1);
    expect(reconPartial.settlements[0]?.purchaseOrderId).toBe("PO-999");
    expect(reconPartial.settlements[0]?.quantity).toBe(1);

    // getTransactionDetails annotates line item
    const details = await getTransactionDetails("sale-1");
    expect(details.stockReconciliation?.status).toBe("partial");
    expect(details.items[0]?.originally_owed).toBe(3);
    expect(details.items[0]?.settled_units).toBe(1);
    expect(details.items[0]?.outstanding_units).toBe(2);

    // Full settlement of remaining 2 units via PO-1000
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, unit_cost, reference_id, reference_type, reason, movement_date, _deleted)
       VALUES ('sm-3', 'p1', 'b1', 'adjustment', -2, 55, 'sale-1', ?, ?, '2026-11-06T14:00:00.000Z', 0);`,
      [BACKORDER_SETTLEMENT_REFERENCE_TYPE, `${BACKORDER_SETTLEMENT_REASON}${ADJUSTMENT_REASON_NOTE_SEPARATOR}PO-1000`],
    );

    const reconFull = await getSaleStockReconciliation("sale-1");
    expect(reconFull.originallyOwed).toBe(3);
    expect(reconFull.settled).toBe(3);
    expect(reconFull.outstanding).toBe(0);
    expect(reconFull.status).toBe("settled");
    expect(reconFull.settlements).toHaveLength(2);

    const recentFull = await getRecentSales();
    expect(recentFull[0]?.stock_originally_owed).toBe(3);
    expect(recentFull[0]?.stock_settled).toBe(3);
  });
});
