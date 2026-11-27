import { describe, it, expect } from "vitest";
import { paymentFaqAnswer, paymentMetaSentence, paymentStepBody, paymentWaysOf } from "@/lib/storefront-payment-ways";

const starter = paymentWaysOf(
  { payment_instructions: null, delivery_available: true, pay_on_delivery: true },
  { online_payment_available: false },
);
const pro = paymentWaysOf(
  { payment_instructions: "MoMo 677", delivery_available: true, pay_on_delivery: true },
  { online_payment_available: false },
);
const everyWay = { delivery: true, transfer: true, online: true };

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

describe("the services version of the payment step", () => {
  it("names every way an Enterprise store takes, led by paying at the store, in English and French", () => {
    expect(paymentStepBody("en", everyWay, "services")).toBe(
      "Pay at the store when you collect your order or come in for your service, on delivery, by transfer or mobile money or online.",
    );
    expect(paymentStepBody("fr", everyWay, "services")).toBe(
      "Payez à la boutique au retrait de votre commande ou lors de votre service, à la livraison, par virement ou mobile money ou en ligne.",
    );
  });

  it("drops a way the store does not take", () => {
    expect(paymentStepBody("en", { delivery: false, transfer: false, online: true }, "services")).toBe(
      "Pay at the store when you collect your order or come in for your service or online.",
    );
  });
});

describe("the payments FAQ answer", () => {
  it("lists only pickup and pay on delivery for a Starter store, in English and French", () => {
    expect(paymentFaqAnswer("en", starter)).toBe("You can pay when you collect or on delivery.");
    expect(paymentFaqAnswer("fr", starter)).toBe("Vous pouvez payer au retrait ou à la livraison.");
  });

  it("lists every way for a store that takes them all", () => {
    expect(paymentFaqAnswer("en", everyWay)).toBe("You can pay when you collect, on delivery, by transfer or mobile money or online.");
  });
});

describe("the storefront meta description's payment sentence", () => {
  it("keeps today's exact wording for a store that takes online and transfer payment, in English and French", () => {
    expect(paymentMetaSentence("en", everyWay)).toBe("Pay online, by transfer, or in store.");
    expect(paymentMetaSentence("fr", everyWay)).toBe("Payez en ligne, par virement ou en boutique.");
  });

  it("never advertises online or transfer payment for a Starter store", () => {
    expect(paymentMetaSentence("en", starter)).toBe("Pay in store.");
    expect(paymentMetaSentence("fr", starter)).toBe("Payez en boutique.");
  });

  it("names only the one of online and transfer the store has", () => {
    expect(paymentMetaSentence("en", pro)).toBe("Pay by transfer or in store.");
    expect(paymentMetaSentence("en", { ...starter, online: true })).toBe("Pay online or in store.");
  });
});
