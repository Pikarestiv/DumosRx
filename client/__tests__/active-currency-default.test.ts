import { describe, it, expect, afterEach } from "vitest";
import { formatCurrency, formatMetricCurrency, getCurrencySymbol } from "@/lib/utils";
import { setActiveCurrency } from "@/lib/active-currency";

// 77 of the app's formatCurrency() call sites omit a currency code.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-active-currency-default-test-ts-L5
describe("money formatters default to the active store's currency", () => {
  afterEach(() => {
    setActiveCurrency(null);
  });

  it("formats in the active currency when the caller passes none", () => {
    setActiveCurrency("XAF");
    expect(formatCurrency(40000)).toBe("40,000 F");
    expect(formatMetricCurrency(40000)).toBe("40,000 F");
    expect(getCurrencySymbol()).toBe("F");
  });

  it("still lets an explicit code win over the active store", () => {
    setActiveCurrency("XAF");
    expect(formatCurrency(40000, "NGN")).toContain("40,000");
    expect(formatCurrency(40000, "NGN")).not.toContain("F");
  });

  it("falls back to NGN before a store profile has resolved", () => {
    setActiveCurrency(null);
    expect(formatCurrency(1000)).toContain("1,000");
    expect(formatCurrency(1000)).not.toContain("F");
  });

  it("ignores a blank or whitespace-only store currency", () => {
    setActiveCurrency("   ");
    expect(formatCurrency(1000)).not.toContain("F");
  });
});

