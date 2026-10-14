import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ReceiptView, type ReceiptTransaction } from "@/components/pos/receipt-view";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { name: "Divamax" }, vatPercentage: 0 }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canCustomizeTheme: false, canRemoveBranding: false }),
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));
vi.mock("react-barcode", () => ({ default: () => <div /> }));

const transaction: ReceiptTransaction = {
  id: "sale-1",
  date: new Date("2026-10-14T10:00:00Z").toISOString(),
  items: [{ id: "i1", name: "Robinet", quantity: 1, unit_price: 1500, subtotal: 1500 }],
  subtotal: 1500,
  tax: 0,
  discount: 0,
  total: 1500,
  amountPaid: 1500,
  change: 0,
  paymentMethod: "cash",
} as ReceiptTransaction;

describe("receipt paper width", () => {
  it("fills the page on A4 instead of printing a narrow centred column", () => {
    const { container } = render(<ReceiptView transaction={transaction} paperSize="a4" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain("w-full");
    expect(root.className).not.toContain("max-w-");
  });

  it("keeps the thermal roll at 80mm with its original column widths", () => {
    const { container } = render(<ReceiptView transaction={transaction} paperSize="thermal" />);
    const headings = Array.from(container.querySelectorAll("span")).filter((span) =>
      ["Qty", "Price", "Total"].includes(span.textContent ?? ""),
    );

    expect((container.firstElementChild as HTMLElement).className).toContain("w-[80mm]");
    expect(headings.map((span) => span.className.split(" ")[0])).toEqual(["w-8", "w-16", "w-20"]);
  });
});
