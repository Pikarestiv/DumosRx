import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ReceiptView, type ReceiptTransaction } from "@/components/pos/receipt-view";

let storeProfile: Record<string, unknown> = { name: "Divamax" };

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile, vatPercentage: 0 }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canCustomizeTheme: false, canRemoveBranding: false }),
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));
vi.mock("react-barcode", () => ({
  default: () => <div data-testid="receipt-barcode" />,
}));

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

const labels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("span")).map((span) => span.textContent);

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

  it("drops its own A4 padding for print, where the @page margin supplies the edge", () => {
    const { container } = render(<ReceiptView transaction={transaction} paperSize="a4" />);

    expect((container.firstElementChild as HTMLElement).className).toContain("print:p-0");
  });
});

describe("receipt length", () => {
  it("omits the sub total when it would just repeat the total", () => {
    const { container } = render(<ReceiptView transaction={transaction} paperSize="a4" />);

    expect(labels(container)).not.toContain("Sub total:");
    expect(labels(container)).toContain("Total:");
  });

  it("keeps the sub total when a discount makes it differ from the total", () => {
    const discounted = { ...transaction, discount: 500, total: 1000 };
    const { container } = render(<ReceiptView transaction={discounted} paperSize="a4" />);

    expect(labels(container)).toContain("Sub total:");
  });

  it("keeps the sub total when tax makes it differ from the total", () => {
    const taxed = { ...transaction, tax: 75, total: 1575 };
    const { container } = render(<ReceiptView transaction={taxed} paperSize="a4" />);

    expect(labels(container)).toContain("Sub total:");
  });

  it("omits total paid when the customer paid the total exactly", () => {
    const { container } = render(<ReceiptView transaction={transaction} paperSize="a4" />);

    expect(labels(container)).not.toContain("Total paid:");
  });

  it("keeps total paid and change when the customer overpaid", () => {
    const overpaid = { ...transaction, amountPaid: 2000, change: 500 };
    const { container } = render(<ReceiptView transaction={overpaid} paperSize="a4" />);

    expect(labels(container)).toContain("Total paid:");
    expect(labels(container)).toContain("Change:");
  });

  it("keeps total paid on a settled credit sale, the only record that it was paid", () => {
    const settledCredit = { ...transaction, paymentMethod: "credit" };
    const { container } = render(<ReceiptView transaction={settledCredit} paperSize="a4" />);

    expect(labels(container)).toContain("Total paid:");
  });

  it("keeps total paid when the sale was only part-paid", () => {
    const partial = { ...transaction, amountPaid: 500, change: 0 };
    const { container } = render(<ReceiptView transaction={partial} paperSize="a4" />);

    expect(labels(container)).toContain("Total paid:");
  });

  it("drops the boxed heading on a receipt but keeps it on a quote", () => {
    const receipt = render(<ReceiptView transaction={transaction} paperSize="a4" />);
    expect(receipt.container.textContent).not.toMatch(/Receipt$/m);
    expect(receipt.container.querySelector("h3")).toBeNull();

    const quote = render(
      <ReceiptView transaction={transaction} paperSize="a4" documentType="quote" />,
    );
    expect(quote.container.querySelector("h3")?.textContent).toBe("Proforma Invoice");
  });

  it("prints one line of vendor branding rather than two", () => {
    const { container } = render(<ReceiptView transaction={transaction} paperSize="a4" />);

    expect(container.textContent).not.toContain("NextGen");
    expect(container.textContent).toContain("Powered by dumosrx.com");
  });

  it("pairs the meta rows into two columns on A4 only", () => {
    const a4 = render(<ReceiptView transaction={transaction} paperSize="a4" />);
    const thermal = render(<ReceiptView transaction={transaction} paperSize="thermal" />);

    expect(a4.container.querySelector(".grid-cols-2")).not.toBeNull();
    expect(thermal.container.querySelector(".grid-cols-2")).toBeNull();
  });
});

describe("receipt footer", () => {
  it("prints the default thank-you for a store that has never set one", () => {
    storeProfile = { name: "Divamax" };
    const { container } = render(<ReceiptView transaction={transaction} paperSize="a4" />);

    expect(container.textContent).toContain("Thank you for your patronage!");
  });

  it("prints no footer at all once the owner clears the field", () => {
    storeProfile = { name: "Divamax", receipt_footer: "" };
    const { container } = render(<ReceiptView transaction={transaction} paperSize="a4" />);

    expect(container.textContent).not.toContain("Thank you for your patronage!");
    storeProfile = { name: "Divamax" };
  });

  it("prints the owner's own wording when they set one", () => {
    storeProfile = { name: "Divamax", receipt_footer: "No refund after 24 hours" };
    const { container } = render(<ReceiptView transaction={transaction} paperSize="a4" />);

    expect(container.textContent).toContain("No refund after 24 hours");
    expect(container.textContent).not.toContain("Thank you for your patronage!");
    storeProfile = { name: "Divamax" };
  });
});

describe("receipt barcode toggle", () => {
  it("prints the barcode for a store that has never set the preference", () => {
    storeProfile = { name: "Divamax" };
    const { queryByTestId } = render(
      <ReceiptView transaction={transaction} paperSize="a4" />,
    );

    expect(queryByTestId("receipt-barcode")).not.toBeNull();
  });

  it("prints the barcode when the preference is on", () => {
    storeProfile = { name: "Divamax", show_barcode_on_receipt: 1 };
    const { queryByTestId } = render(
      <ReceiptView transaction={transaction} paperSize="a4" />,
    );

    expect(queryByTestId("receipt-barcode")).not.toBeNull();
  });

  it("omits the barcode when the store switched it off", () => {
    storeProfile = { name: "Divamax", show_barcode_on_receipt: 0 };
    const { queryByTestId } = render(
      <ReceiptView transaction={transaction} paperSize="a4" />,
    );

    expect(queryByTestId("receipt-barcode")).toBeNull();
    storeProfile = { name: "Divamax" };
  });
});
