import { describe, it, expect } from "vitest";

/**
 * A-56: a mixed payment of cash 400 + credit 800 on a 1,000 total passes the
 * coverage check (splits sum to 1,200) while the customer only owes 600 —
 * the extra 200 was written straight onto outstanding_balance with no sale to
 * settle it against. The credit split can never exceed
 * total - sum(non-credit splits).
 */
describe("mixed payment — over-allocated credit split", () => {
  it("caps the allowed credit split at the total less every non-credit tender", async () => {
    const { calculateMaxAllowedCreditSplit } = await import("@/lib/utils/pos-calculations");
    expect(calculateMaxAllowedCreditSplit([{ method: "cash", amount: 400 }], 1000)).toBe(600);
    expect(
      calculateMaxAllowedCreditSplit(
        [{ method: "cash", amount: 400 }, { method: "card", amount: 200 }],
        1000,
      ),
    ).toBe(400);
    // Over-tendered non-credit cash leaves no room for credit at all.
    expect(calculateMaxAllowedCreditSplit([{ method: "cash", amount: 1200 }], 1000)).toBe(0);
    // A negative split cannot create credit headroom.
    expect(calculateMaxAllowedCreditSplit([{ method: "cash", amount: -400 }], 1000)).toBe(1000);
  });

  it("flags an over-allocated credit split, with a cent of tolerance", async () => {
    const { isCreditSplitOverAllocated } = await import("@/lib/utils/pos-calculations");
    expect(
      isCreditSplitOverAllocated(
        [{ method: "cash", amount: 400 }, { method: "credit", amount: 800 }],
        1000,
      ),
    ).toBe(true);
    expect(
      isCreditSplitOverAllocated(
        [{ method: "cash", amount: 400 }, { method: "credit", amount: 600 }],
        1000,
      ),
    ).toBe(false);
    expect(
      isCreditSplitOverAllocated(
        [{ method: "cash", amount: 400 }, { method: "credit", amount: 600.004 }],
        1000,
      ),
    ).toBe(false);
  });

  it("validatePaymentReadiness rejects the over-allocated credit split", async () => {
    const { validatePaymentReadiness } = await import("@/lib/hooks/use-pos-payment-helpers");
    const base = {
      paymentMethod: "mixed" as const,
      requireSaleNotes: false,
      saleNote: "",
      amountPaid: "",
      total: 1000,
      requirePaymentAccount: false,
      selectedAccountId: "",
    };

    expect(
      validatePaymentReadiness({
        ...base,
        paymentSplits: [
          { method: "cash", amount: 400 },
          { method: "credit", amount: 800 },
        ],
      }),
    ).toMatch(/credit/i);

    expect(
      validatePaymentReadiness({
        ...base,
        paymentSplits: [
          { method: "cash", amount: 400 },
          { method: "credit", amount: 600 },
        ],
      }),
    ).toBeNull();
  });
});
