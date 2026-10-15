import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ReceiptPreview } from "@/components/settings/store/receipt-preview";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { name: "Saved Name" }, vatPercentage: 0 }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canCustomizeTheme: true, canRemoveBranding: true }),
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));
vi.mock("react-barcode", () => ({
  default: () => <div data-testid="receipt-barcode" />,
}));

const props = {
  localName: "Unsaved Name",
  localAddress: "",
  localPhone: "",
  localLogo: "",
  localReceiptHeader: "",
  localReceiptFooter: "",
  localReceiptTagline: "",
  showLogo: false,
  showPhone: false,
  showAddress: false,
  showBarcode: true,
  hidePoweredBy: false,
};

/** The preview used to be a second, hand-drawn receipt that knew nothing about
 * paper size, so the selector beside it appeared to do nothing — and it drifted
 * from what actually prints. It renders the real ReceiptView now. */
describe("receipt settings live preview", () => {
  it("renders the 80mm roll when the device is set to thermal", () => {
    const { container } = render(<ReceiptPreview {...props} paperSize="thermal" />);

    expect(container.innerHTML).toContain("w-[80mm]");
    expect(container.innerHTML).not.toContain("print:p-0");
  });

  it("renders the full-width page when the device is set to A4", () => {
    const { container } = render(<ReceiptPreview {...props} paperSize="a4" />);

    expect(container.innerHTML).toContain("print:p-0");
    expect(container.innerHTML).not.toContain("w-[80mm]");
  });

  it("shows what the owner has typed, not the saved store name", () => {
    const { container } = render(<ReceiptPreview {...props} paperSize="a4" />);

    expect(container.textContent).toContain("Unsaved Name");
    expect(container.textContent).not.toContain("Saved Name");
  });

  it("follows the barcode toggle, so the preview cannot promise what no receipt prints", () => {
    const on = render(<ReceiptPreview {...props} paperSize="a4" />);
    expect(on.container.querySelector("[data-testid=receipt-barcode]")).not.toBeNull();

    const off = render(<ReceiptPreview {...props} showBarcode={false} paperSize="a4" />);
    expect(off.container.querySelector("[data-testid=receipt-barcode]")).toBeNull();
  });
});
