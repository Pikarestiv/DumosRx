import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

const mediaState = { isDesktop: false };

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => mediaState.isDesktop,
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN", uppercase_display_enabled: 0 } }),
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplay: () => false,
  useUppercaseDisplayClass: () => "",
  capitalizeWords: (s: string) => s,
}));

vi.mock("@/lib/hooks/queries/use-users", () => ({
  useUsers: () => ({
    data: [
      { id: "u1", first_name: "Ada", last_name: "Okafor", is_active: true },
    ],
  }),
}));

vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({ className }: { className?: string }) => (
    <div data-testid="date-range-picker" className={className} />
  ),
}));

import {
  ProductPerformanceTable,
  type ProductPerformanceRow,
} from "@/components/analytics/product-performance-table";
import { CustomerBehaviorTab } from "@/components/analytics/customer-behavior-tab";
import { ReportFiltersBar } from "@/components/reports/report-filters-bar";

const sampleProducts: ProductPerformanceRow[] = [
  {
    id: "p1",
    name: "Norvasc 5mg",
    category: "Antihypertensives",
    revenue: 12000,
    units: 4,
    cost: 8000,
    margin: 33.3,
  },
  {
    id: "p2",
    name: "Loratadine (Claritin)",
    category: "Antihistamines",
    revenue: 4500,
    units: 15,
    cost: 5000,
    margin: -11.1,
  },
];

describe("Analytics & Report mobile UI layouts", () => {
  beforeEach(() => {
    mediaState.isDesktop = false;
  });

  it("renders mobile cards instead of a scrolling table for ProductPerformanceTable below lg", () => {
    const { container } = render(
      <ProductPerformanceTable products={sampleProducts} />,
    );

    expect(container.querySelector('[role="table"]')).toBeNull();
    const cards = container.querySelectorAll("[data-product-performance-card-mobile]");
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain("Norvasc 5mg");
    expect(cards[0].textContent).toContain("33%");
    expect(cards[1].textContent).toContain("Loratadine (Claritin)");
    expect(cards[1].textContent).toContain("-11%");

    fireEvent.click(screen.getByRole("button", { name: "Units" }));
    const reordered = container.querySelectorAll("[data-product-performance-card-mobile]");
    expect(reordered[0].textContent).toContain("Norvasc 5mg");

    fireEvent.click(screen.getByRole("button", { name: "Units" }));
    const flipped = container.querySelectorAll("[data-product-performance-card-mobile]");
    expect(flipped[0].textContent).toContain("Loratadine (Claritin)");
  });

  it("renders the desktop virtualized table for ProductPerformanceTable at lg and above", () => {
    mediaState.isDesktop = true;
    const { container } = render(
      <ProductPerformanceTable products={sampleProducts} />,
    );

    expect(container.querySelector('[role="table"][aria-label="Product performance"]')).not.toBeNull();
    expect(container.querySelector("[data-product-performance-card-mobile]")).toBeNull();
  });

  it("renders mobile cards instead of the 4-column grid table for CustomerBehaviorTab below lg", () => {
    const { container, rerender } = render(
      <CustomerBehaviorTab
        customerMetrics={[]}
        purchasePatterns={[
          { slot: "Morning", transactions: 1, avgValue: 6300, topCategory: "Antihypertensives" },
          { slot: "Night", transactions: 2, avgValue: 4100, topCategory: "Antihistamines" },
        ]}
      />,
    );

    expect(container.querySelector('[role="table"]')).toBeNull();
    const cards = container.querySelectorAll("[data-purchase-pattern-card-mobile]");
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain("Morning");
    expect(cards[0].textContent).toContain("1 transaction");
    expect(cards[0].textContent).toContain("Antihypertensives");
    expect(cards[1].textContent).toContain("2 transactions");

    mediaState.isDesktop = true;
    rerender(
      <CustomerBehaviorTab
        customerMetrics={[]}
        purchasePatterns={[
          { slot: "Morning", transactions: 1, avgValue: 6300, topCategory: "Antihypertensives" },
        ]}
      />,
    );

    expect(container.querySelector('[role="table"][aria-label="Customer purchase patterns"]')).not.toBeNull();
    expect(container.querySelector("[data-purchase-pattern-card-mobile]")).toBeNull();
  });

  it("places staff and payment method selectors side-by-side on mobile when both are visible", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <ReportFiltersBar
        value={{ dateRange: { from: "2026-10-01", to: "2026-10-31" } }}
        onChange={onChange}
      />,
    );

    const grid = container.querySelector(".grid.grid-cols-2");
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll("button").length).toBe(2);

    rerender(
      <ReportFiltersBar
        value={{ dateRange: { from: "2026-10-01", to: "2026-10-31" } }}
        onChange={onChange}
        showPaymentMethod={false}
      />,
    );
    expect(container.querySelector(".grid.grid-cols-2")).toBeNull();
  });
});
