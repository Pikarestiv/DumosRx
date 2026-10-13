import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetricCard } from "@/components/ui/metric-card";

/**
 * Clickable metric cards are shortcuts into the screen behind the figure
 * (Daily Close's payment totals open the sales list, Net Cash Expected
 * opens the expense ledger). A div with an onClick is invisible to the
 * keyboard, so they carry button semantics; a card with no onClick stays a
 * plain card and must not be focusable.
 */
describe("MetricCard", () => {
  it("is operable by keyboard when it acts as a shortcut", () => {
    const onClick = vi.fn();
    render(<MetricCard title="Cash Expected" value="₦1,000" onClick={onClick} />);

    const card = screen.getByRole("button", { name: /Cash Expected/ });
    expect(card.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("stays a plain, unfocusable card when it is only a figure", () => {
    render(<MetricCard title="Total Profit" value="₦500" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("Total Profit").closest("[tabindex]"),
    ).toBeNull();
  });
});
