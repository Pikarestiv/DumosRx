import { describe, it, expect } from "vitest";
import { derivePaymentStatus, effectiveAmountPaid, amountPaidForSave } from "@/components/procurement/po-payment";

describe("payment status derived from the amount paid", () => {
  it("reads nothing paid as unpaid, part as partial and the full total or more as paid", () => {
    expect(derivePaymentStatus(0, 5000)).toBe("unpaid");
    expect(derivePaymentStatus(1, 5000)).toBe("partial");
    expect(derivePaymentStatus(5000, 5000)).toBe("paid");
    expect(derivePaymentStatus(6000, 5000)).toBe("paid");
  });

  it("calls an empty order with nothing paid unpaid, not paid", () => {
    expect(derivePaymentStatus(0, 0)).toBe("unpaid");
  });

  it("turns a paid order partial once its total grows past what was paid", () => {
    expect(derivePaymentStatus(5000, 5200)).toBe("partial");
  });

  it("ignores negative or non-numeric amounts", () => {
    expect(derivePaymentStatus(-5, 100)).toBe("unpaid");
    expect(derivePaymentStatus(Number.NaN, 100)).toBe("unpaid");
  });
});

describe("legacy fully-paid orders", () => {
  it("reads a stored 'paid' as fully paid whatever amount_paid says, so older rows never look owed", () => {
    expect(effectiveAmountPaid({ payment_status: "paid", amount_paid: 0, total_amount: 5000 })).toBe(5000);
    expect(effectiveAmountPaid({ payment_status: "paid", amount_paid: null, total_amount: 5000 })).toBe(5000);
  });

  it("takes the stored amount for anything else", () => {
    expect(effectiveAmountPaid({ payment_status: "partial", amount_paid: 1200, total_amount: 5000 })).toBe(1200);
    expect(effectiveAmountPaid({ payment_status: null, amount_paid: null, total_amount: 5000 })).toBe(0);
  });
});

describe("amount saved", () => {
  it("tracks the total while marked paid in full, and caps a typed amount at the total", () => {
    expect(amountPaidForSave({ paidInFull: true, amountPaid: "10" }, 5000)).toBe(5000);
    expect(amountPaidForSave({ paidInFull: false, amountPaid: "6000" }, 5000)).toBe(5000);
    expect(amountPaidForSave({ paidInFull: false, amountPaid: "1250.505" }, 5000)).toBe(1250.51);
    expect(amountPaidForSave({ paidInFull: false, amountPaid: "" }, 5000)).toBe(0);
  });
});
