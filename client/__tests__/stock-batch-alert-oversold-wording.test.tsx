import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { StockBatchInsightsTab } from "@/components/analytics/stock-batch-insights-tab";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

// An oversold alert's `quantity` is a deficit, not a stock level, and it has no reorder threshold — rendering it through t…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-stock-batch-alert-oversold-wording-test-tsx-L12
describe("Critical Stock Batch Alerts wording", () => {
  const renderWith = (alerts: Parameters<typeof StockBatchInsightsTab>[0]["stock_batchAlerts"]) =>
    render(<StockBatchInsightsTab stock_batchAlerts={alerts} salesByCategory={[]} />);

  it("states an oversold item's deficit and never a min threshold", () => {
    renderWith([
      { product: "ampoul vellmax 20w", issue: "Oversold", quantity: 4, severity: "critical" },
    ]);
    expect(screen.getByText(/Oversold: short by 4 unit\(s\)/)).toBeTruthy();
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.queryByText(/in stock/)).toBeNull();
  });

  it("keeps the stock-level sentence for low stock", () => {
    renderWith([
      {
        product: "scotch transparent g,gm",
        issue: "Low Stock",
        quantity: 0,
        threshold: 10,
        unit: "Unit",
        severity: "critical",
      },
    ]);
    expect(
      screen.getByText(/Low Stock: 0 Unit\(s\) in stock \(min: 10 Unit\(s\)\)/),
    ).toBeTruthy();
  });
});
