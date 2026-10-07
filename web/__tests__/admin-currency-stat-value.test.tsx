import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CurrencyStatValue } from "@/components/admin/dashboard/currency-stat-value";

describe("CurrencyStatValue", () => {
  it("renders one line per currency present", () => {
    render(<CurrencyStatValue totals={{ NGN: 15000, GHS: 300 }} />);

    expect(screen.getByText(/15,000/)).toBeDefined();
    expect(screen.getByText(/300/)).toBeDefined();
  });

  it("formats each currency with its own symbol, never a blanket naira", () => {
    render(<CurrencyStatValue totals={{ NGN: 1000, GHS: 200 }} />);

    expect(screen.getByText(/₦1,000/)).toBeDefined();
    expect(screen.queryByText("₦200")).toBeNull();
  });

  it("shows an explicit empty state rather than a zero amount", () => {
    render(<CurrencyStatValue totals={{}} />);

    expect(screen.getByText(/no payments yet/i)).toBeDefined();
  });

  it("does not crash when totals are missing entirely", () => {
    render(<CurrencyStatValue totals={undefined as never} />);

    expect(screen.getByText(/no payments yet/i)).toBeDefined();
  });

  it("uses a caller-supplied empty label when given one", () => {
    render(<CurrencyStatValue totals={{}} emptyLabel="No stock recorded" />);

    expect(screen.getByText("No stock recorded")).toBeDefined();
    expect(screen.queryByText(/no payments yet/i)).toBeNull();
  });
});
