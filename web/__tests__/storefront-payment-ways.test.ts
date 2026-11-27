import { describe, it, expect } from "vitest";
import { paymentStepBody, paymentWaysOf } from "@/lib/storefront-payment-ways";

const starter = paymentWaysOf(
  { payment_instructions: null, delivery_available: true, pay_on_delivery: true },
  { online_payment_available: false },
);
const pro = paymentWaysOf(
  { payment_instructions: "MoMo 677", delivery_available: true, pay_on_delivery: true },
  { online_payment_available: false },
);

describe("the How ordering works payment step", () => {
  it("names only pickup and pay on delivery for a Starter store, in English and French", () => {
    expect(paymentStepBody("en", starter)).toBe("Pay when you collect or on delivery.");
    expect(paymentStepBody("fr", starter)).toBe("Payez au retrait ou à la livraison.");
  });

  it("adds transfer for a store that publishes payment instructions and online only when the store takes it", () => {
    expect(paymentStepBody("en", pro)).toBe("Pay when you collect, on delivery or by transfer or mobile money.");
    expect(paymentStepBody("en", { ...pro, online: true })).toMatch(/or online\.$/);
    expect(paymentStepBody("fr", pro)).toBe("Payez au retrait, à la livraison ou par virement ou mobile money.");
  });

  it("says pickup only when the store neither delivers with pay on delivery nor takes transfer or online", () => {
    const pickupOnly = paymentWaysOf({ payment_instructions: "", delivery_available: true, pay_on_delivery: false }, {});
    expect(paymentStepBody("en", pickupOnly)).toBe("Pay when you collect.");
  });
});
