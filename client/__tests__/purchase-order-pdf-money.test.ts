import { describe, it, expect } from "vitest";
import { formatPdfMoney } from "@/components/procurement/purchase-order-pdf";

describe("formatPdfMoney", () => {
  it("prefixes the store's currency code, since the PDF's built-in fonts cannot draw currency symbols", () => {
    expect(formatPdfMoney(1500, "XAF")).toBe("XAF 1,500");
  });

  it("falls back to the platform currency and keeps decimals that matter", () => {
    expect(formatPdfMoney(12.5)).toBe("NGN 12.5");
  });
});
