import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionItem } from "@/components/pos/transaction-item";
import type { SaleWithDetails } from "@/lib/types/sale";

const sale: SaleWithDetails = {
  id: "s1",
  transaction_number: "REC-1001",
  subtotal: 1000,
  total_amount: 1000,
  payment_method: "cash",
  created_at: "2026-11-06T10:00:00.000Z",
  payment_status: "completed",
};

describe("transaction history line count (A-365)", () => {
  it.each([
    [0, "0 items"],
    [1, "1 item"],
    [3, "3 items"],
  ])("reads a sale counting %i units as '%s'", (count, label) => {
    render(<TransactionItem sale={{ ...sale, item_count: count }} onSelect={vi.fn()} onReturnClick={vi.fn()} />);

    expect(screen.getByText(new RegExp(`${label} ·`))).toBeTruthy();
  });
});
