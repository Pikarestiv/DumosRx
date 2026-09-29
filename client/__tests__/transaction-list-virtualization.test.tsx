import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React, { createRef } from "react";
import type { SaleWithDetails } from "@/lib/types/sale";

// jsdom reports zero size for every element, so the real useVirtualizer would
// compute an empty visible range and nothing would render. Stubbed to return
// every row, same shape react-virtual does - these tests are about the
// flattening and ordering, not virtualization mechanics (that needs real
// layout, i.e. an e2e browser test).
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: () => number;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        start: index * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
    measureElement: () => {},
    options: { scrollMargin: 0 },
  }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { role: "store_owner" } }),
}));

import {
  TransactionList,
  flattenGroupedSales,
} from "@/components/pos/transaction-list";

function sale(id: string, overrides: Partial<SaleWithDetails> = {}) {
  return {
    id,
    transaction_number: `TXN-${id}`,
    created_at: "2026-03-10T10:00:00.000Z",
    total_amount: 100,
    payment_method: "cash",
    item_count: 2,
    ...overrides,
  } as SaleWithDetails;
}

describe("flattenGroupedSales", () => {
  it("emits a header per non-empty group followed by its rows, in group order", () => {
    const flat = flattenGroupedSales({
      TODAY: [sale("a"), sale("b")],
      YESTERDAY: [],
      "THIS WEEK": [sale("c")],
      OLDER: [],
    });

    expect(flat.map((e) => (e.type === "header" ? e.label : e.sale.id))).toEqual(
      ["TODAY", "a", "b", "THIS WEEK", "c"],
    );
  });

  it("skips empty groups entirely, including their header", () => {
    const flat = flattenGroupedSales({ TODAY: [], OLDER: [sale("z")] });
    expect(flat).toHaveLength(2);
    expect(flat[0]).toEqual({ type: "header", label: "OLDER" });
  });

  it("returns nothing for no sales at all", () => {
    expect(flattenGroupedSales({ TODAY: [], OLDER: [] })).toEqual([]);
  });
});

describe("TransactionList", () => {
  it("renders every group header and transaction from the flattened list", () => {
    render(
      <TransactionList
        groupedSales={{
          TODAY: [sale("a"), sale("b")],
          YESTERDAY: [],
          "THIS WEEK": [sale("c")],
          OLDER: [],
        }}
        onSelectSale={() => {}}
        onReturnClick={() => {}}
        hasFilters={false}
        scrollElementRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.getByText("TODAY")).toBeTruthy();
    expect(screen.getByText("THIS WEEK")).toBeTruthy();
    expect(screen.queryByText("YESTERDAY")).toBeNull();
    for (const id of ['a', 'b', 'c']) {
      expect(screen.getByText(new RegExp(`TXN-${id}`))).toBeTruthy();
    }
  });

  it("shows the empty state when the filters match nothing", () => {
    render(
      <TransactionList
        groupedSales={{}}
        onSelectSale={() => {}}
        onReturnClick={() => {}}
        hasFilters
        scrollElementRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.getByText("No recent sales found")).toBeTruthy();
  });
});
