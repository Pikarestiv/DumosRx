import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { POSwitchToStandardDialog } from "@/components/procurement/po-switch-to-standard-dialog";
import { hasImmediateOnlyFields } from "@/components/procurement/po-line-item-math";

describe("hasImmediateOnlyFields", () => {
  it("is true only when a line carries a typed price, cost, lot or expiry", () => {
    expect(hasImmediateOnlyFields([{ product_id: "a" }])).toBe(false);
    expect(hasImmediateOnlyFields([{ product_id: "a", selling_price: "" }, { product_id: "b", lot_number: "" }])).toBe(false);
    expect(hasImmediateOnlyFields([{ product_id: "a" }, { product_id: "b", cost_price_override: 5 }])).toBe(true);
    expect(hasImmediateOnlyFields([{ product_id: "a", expiry_date: "2027-01-01" }])).toBe(true);
  });
});

describe("POSwitchToStandardDialog", () => {
  it("asks before discarding and calls back on each choice", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<POSwitchToStandardDialog open onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText(/price, cost, lot and expiry/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep Immediate" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Switch & Clear" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
