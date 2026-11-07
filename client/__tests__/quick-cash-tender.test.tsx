import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { getQuickCashOptions } from "@/lib/utils/pos-calculations";
import { QuickCashTender } from "@/components/pos/quick-cash-tender";

describe("getQuickCashOptions", () => {
  it("returns empty array for invalid or zero totals", () => {
    expect(getQuickCashOptions(0)).toEqual([]);
    expect(getQuickCashOptions(-100)).toEqual([]);
    expect(getQuickCashOptions(NaN)).toEqual([]);
  });

  it("suggests exact total and sensible rounding denominations for 850", () => {
    const options = getQuickCashOptions(850);
    expect(options[0]).toBe(850);
    expect(options).toContain(1000);
    expect(options).toContain(2000);
  });

  it("suggests sensible denominations for larger amounts", () => {
    const options = getQuickCashOptions(3200);
    expect(options[0]).toBe(3200);
    expect(options).toContain(3500);
    expect(options).toContain(4000);
  });
});

describe("QuickCashTender component", () => {
  it("renders exact and quick cash buttons and triggers onSelectAmount", () => {
    const onSelectAmount = vi.fn();
    render(
      <QuickCashTender
        total={850}
        amountPaid="700"
        onSelectAmount={onSelectAmount}
        currencyCode="NGN"
      />,
    );

    const exactBtn = screen.getByRole("button", { name: /Exact/i });
    expect(exactBtn).toBeTruthy();

    fireEvent.click(exactBtn);
    expect(onSelectAmount).toHaveBeenCalledWith("850");
  });
});
