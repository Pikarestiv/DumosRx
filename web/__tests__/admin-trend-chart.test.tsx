import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendChart, formatBucketLabel } from "@/components/admin/trends/trend-chart";
import type { TrendSeries } from "@/lib/types/admin";

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

const series: TrendSeries = {
  currencies: [],
  points: [
    { bucket: "2026-08", values: { count: 3 } },
    { bucket: "2026-09", values: { count: 0 } },
    { bucket: "2026-10", values: { count: 5 } },
  ],
};

describe("formatBucketLabel", () => {
  /** §6: DD/MM/YYYY, never the US order. */
  it("renders a daily bucket as DD/MM/YYYY", () => {
    expect(formatBucketLabel("2026-10-07", "day")).toBe("07/10/2026");
  });

  it("renders a monthly bucket as a month and year, not a fabricated day", () => {
    expect(formatBucketLabel("2026-10", "month")).toBe("Oct 2026");
  });

  /** A bare YYYY-MM-DD parsed as UTC shifts a day west of Greenwich. */
  it("does not shift a date-only bucket across the day boundary", () => {
    expect(formatBucketLabel("2026-01-01", "day")).toBe("01/01/2026");
  });
});

describe("TrendChart", () => {
  it("renders the series title", () => {
    render(<TrendChart title="Store signups" series={series} granularity="month" valueKeys={["count"]} />);

    expect(screen.getByText("Store signups")).toBeDefined();
  });

  /**
   * Phase 1's rule. A series that could not be computed must not render as a
   * flat line at zero, which reads as "nothing happened" — a statement about
   * the business rather than about the query.
   */
  it("renders unavailable rather than an empty chart when the series is missing", () => {
    render(<TrendChart title="Churn" series={undefined} granularity="month" valueKeys={["count"]} />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
  });

  /** A zero-filled bucket is a real measurement and must still draw. */
  it("treats an all-zero series as data, not as unavailable", () => {
    const allZero: TrendSeries = {
      currencies: [],
      points: [
        { bucket: "2026-09", values: { count: 0 } },
        { bucket: "2026-10", values: { count: 0 } },
      ],
    };

    render(<TrendChart title="Churn" series={allZero} granularity="month" valueKeys={["count"]} />);

    expect(screen.queryByText(/unavailable/i)).toBeNull();
  });

  it("renders unavailable when the series has no points at all", () => {
    render(
      <TrendChart
        title="Churn"
        series={{ currencies: [], points: [] }}
        granularity="month"
        valueKeys={["count"]}
      />,
    );

    expect(screen.getByText(/unavailable/i)).toBeDefined();
  });
});
