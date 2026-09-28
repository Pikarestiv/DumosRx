import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { POReviewPricePopover } from "@/components/procurement/po-review-price-popover";

/**
 * The trigger always read a neutral "Review price", so once the popover
 * closed there was no way to tell which lines had actually been repriced.
 * And a sell price at or below cost rendered its margin in the same muted
 * grey as a healthy one, with nothing saying it was a loss.
 */
describe("POReviewPricePopover reviewed/at-a-loss state", () => {
  it("shows the neutral prompt while the line still carries the product's current price", () => {
    render(
      <POReviewPricePopover
        costPrice={400}
        sellingPrice={620}
        currentSellingPrice={620}
        onSellingPriceChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Review price" })).toBeTruthy();
  });

  it("shows the new price on the trigger once it differs from the product's current price", () => {
    render(
      <POReviewPricePopover
        costPrice={400}
        sellingPrice={700}
        currentSellingPrice={620}
        onSellingPriceChange={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Edit price" });
    expect(button.textContent).toContain("₦700");
  });

  it("warns, in destructive styling, when the sell price is at or below cost", () => {
    render(
      <POReviewPricePopover
        costPrice={400}
        sellingPrice={350}
        currentSellingPrice={620}
        onSellingPriceChange={vi.fn()}
      />,
    );

    act(() => {
      screen.getByRole("button", { name: "Edit price" }).click();
    });

    const margin = document.body.querySelector('[data-testid="po-margin"]');
    expect(margin).not.toBeNull();
    expect(margin!.textContent).toContain("below cost");
    expect(margin!.className).toContain("text-destructive");
  });

  it("leaves a healthy margin in muted styling with no warning", () => {
    render(
      <POReviewPricePopover
        costPrice={400}
        sellingPrice={700}
        currentSellingPrice={620}
        onSellingPriceChange={vi.fn()}
      />,
    );

    act(() => {
      screen.getByRole("button", { name: "Edit price" }).click();
    });

    const margin = document.body.querySelector('[data-testid="po-margin"]');
    expect(margin).not.toBeNull();
    expect(margin!.textContent).not.toContain("below cost");
    expect(margin!.className).not.toContain("text-destructive");
  });
});
