import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeType: "pharmacy",
    storeProfile: { uppercase_display_enabled: 1 },
  }),
}));

import { TransactionItem } from "@/components/pos/transaction-item";
import { TransactionStockReconciliation } from "@/components/pos/transaction-stock-reconciliation";
import { TransactionItemsView } from "@/components/pos/transaction-items-view";
import type { SaleWithDetails, SaleStockReconciliation, SaleItemDetail } from "@/lib/types/sale";

const baseSale: SaleWithDetails = {
  id: "s1",
  transaction_number: "REC-1001",
  subtotal: 1000,
  total_amount: 1000,
  payment_method: "cash",
  created_at: "2026-11-06T10:00:00.000Z",
  item_count: 2,
  customer_name: "John Doe",
  payment_status: "completed",
};

describe("TransactionItem Stock Owed Badges", () => {
  it("renders 'Stock owed · Open' when sale has owed units and 0 settled", () => {
    const sale: SaleWithDetails = { ...baseSale, stock_originally_owed: 5, stock_settled: 0 };
    render(<TransactionItem sale={sale} onSelect={vi.fn()} onReturnClick={vi.fn()} />);
    expect(screen.getByText("Stock owed · Open")).toBeTruthy();
  });

  it("renders 'Stock owed · Partial' when sale is partially settled", () => {
    const sale: SaleWithDetails = { ...baseSale, stock_originally_owed: 5, stock_settled: 2 };
    render(<TransactionItem sale={sale} onSelect={vi.fn()} onReturnClick={vi.fn()} />);
    expect(screen.getByText("Stock owed · Partial")).toBeTruthy();
  });

  it("renders 'Stock owed · Settled' when sale is fully settled", () => {
    const sale: SaleWithDetails = { ...baseSale, stock_originally_owed: 5, stock_settled: 5 };
    render(<TransactionItem sale={sale} onSelect={vi.fn()} onReturnClick={vi.fn()} />);
    expect(screen.getByText("Stock owed · Settled")).toBeTruthy();
  });

  it("does not render stock owed badge when sale had no backorder", () => {
    const sale: SaleWithDetails = { ...baseSale, stock_originally_owed: 0, stock_settled: 0 };
    render(<TransactionItem sale={sale} onSelect={vi.fn()} onReturnClick={vi.fn()} />);
    expect(screen.queryByText(/Stock owed/i)).toBeNull();
  });
});

describe("TransactionStockReconciliation Card", () => {
  it("renders reconciliation overview and settlement receipts", () => {
    const reconciliation: SaleStockReconciliation = {
      originallyOwed: 5,
      settled: 2,
      outstanding: 3,
      status: "partial",
      settlements: [
        {
          productId: "p1",
          productName: "Paracetamol 500mg",
          quantity: 2,
          unitCost: 50,
          purchaseOrderId: "PO-2024",
          movementDate: "2026-11-06T12:00:00.000Z",
        },
      ],
    };

    render(<TransactionStockReconciliation reconciliation={reconciliation} />);
    expect(screen.getByText("Stock Reconciliation")).toBeTruthy();
    expect(screen.getByText("Stock owed · Partial")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy(); // Originally Owed
    expect(screen.getByText("2")).toBeTruthy(); // Settled
    expect(screen.getByText("3")).toBeTruthy(); // Outstanding
    expect(screen.getByText(/via PO-2024/)).toBeTruthy();
  });
});

describe("TransactionItemsView Stock Owed breakdown", () => {
  it("shows line breakdown when item was partially sold from unrecorded stock", () => {
    const items: SaleItemDetail[] = [
      {
        id: "si-1",
        sale_id: "s1",
        product_id: "p1",
        product_name: "Amoxicillin",
        quantity: 5,
        unit_price: 200,
        total_price: 1000,
        originally_owed: 2,
      },
    ];

    render(<TransactionItemsView items={items} />);
    expect(screen.getAllByText(/3 recorded · 2 owed/).length).toBeGreaterThan(0);
  });

  it("shows full owed label when entire line was unrecorded stock", () => {
    const items: SaleItemDetail[] = [
      {
        id: "si-1",
        sale_id: "s1",
        product_id: "p1",
        product_name: "Amoxicillin",
        quantity: 2,
        unit_price: 200,
        total_price: 400,
        originally_owed: 2,
      },
    ];

    render(<TransactionItemsView items={items} />);
    expect(screen.getAllByText(/2 owed/).length).toBeGreaterThan(0);
  });
});
