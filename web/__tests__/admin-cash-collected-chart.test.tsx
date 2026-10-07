import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CashCollectedChart } from "@/components/admin/trends/cash-collected-chart";
import type { TrendSeries } from "@/lib/types/admin";

const emptyWindow: TrendSeries = {
  currencies: [],
  points: [
    { bucket: "2026-09", values: {} },
    { bucket: "2026-10", values: {} },
  ],
};

describe("CashCollectedChart", () => {
  /**
   * With no currencies there are no lines to draw, so the chart rendered an
   * empty grid — which reads as "something is broken" just as easily as
   * "no revenue". Found in the Phase 4 browser smoke test.
   */
  it("says there were no payments rather than drawing an empty grid", () => {
    render(<CashCollectedChart series={emptyWindow} granularity="month" />);

    expect(screen.getByText(/no payments/i)).toBeDefined();
  });

  /** Distinct from the above: a missing payload means we could not look. */
  it("still reports unavailable when the series itself is missing", () => {
    render(<CashCollectedChart series={undefined} granularity="month" />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/no payments/i)).toBeNull();
  });

  it("draws the chart when there is at least one currency", () => {
    const withMoney: TrendSeries = {
      currencies: ["NGN"],
      points: [
        { bucket: "2026-09", values: { NGN: 0 } },
        { bucket: "2026-10", values: { NGN: 12000 } },
      ],
    };

    render(<CashCollectedChart series={withMoney} granularity="month" />);

    expect(screen.queryByText(/no payments/i)).toBeNull();
    expect(screen.queryByText(/unavailable/i)).toBeNull();
  });
});
