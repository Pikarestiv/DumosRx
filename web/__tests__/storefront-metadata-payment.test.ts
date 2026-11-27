import { describe, it, expect } from "vitest";

import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { storefrontCopy } from "@/lib/storefront-copy";
import { buildStorefrontMetadata } from "@/lib/storefront-metadata";
import { paymentWaysOf } from "@/lib/storefront-payment-ways";

const profile = (overrides: Partial<StorefrontProfile> = {}): StorefrontProfile => ({
  id: "f1", slug: "divamax", name: "Divamax", delivery_available: true, pay_on_delivery: true, ...overrides,
});
const proStore: StorefrontStore = { id: "s1", name: "Divamax", location: "Douala", online_payment_available: true };
const proProfile = profile({ payment_instructions: "MoMo 677 000 000" });
const starterStore: StorefrontStore = { id: "s1", name: "Divamax", location: "Douala", online_payment_available: false };
const starterProfile = profile({ payment_instructions: null });

describe("the storefront page meta description", () => {
  it("is byte-identical to the pre-Starter text for a store with online and transfer payment", () => {
    const meta = buildStorefrontMetadata("divamax", proStore, "en", proProfile);
    expect(meta.description).toBe("Browse and order from Divamax in Douala. Pay online, by transfer, or in store.");
    expect(meta.openGraph?.description).toBe(meta.description);
    expect(buildStorefrontMetadata("divamax", { ...proStore, location: null }, "fr", proProfile).description).toBe(
      "Parcourez et commandez chez Divamax. Payez en ligne, par virement ou en boutique.",
    );
  });

  it("never advertises online or transfer payment on a Starter store", () => {
    expect(buildStorefrontMetadata("divamax", starterStore, "en", starterProfile).description).toBe(
      "Browse and order from Divamax in Douala. Pay in store.",
    );
    expect(buildStorefrontMetadata("divamax", starterStore, "fr", starterProfile).description).toBe(
      "Parcourez et commandez chez Divamax à Douala. Payez en boutique.",
    );
  });

  it("claims no transfer when the storefront profile is missing", () => {
    expect(buildStorefrontMetadata("divamax", proStore).description).toBe(
      "Browse and order from Divamax in Douala. Pay online or in store.",
    );
  });
});

describe("the payments FAQ on the storefront FAQ page", () => {
  const paymentsAnswer = (store: StorefrontStore, storefront: StorefrontProfile, storeType: string) =>
    storefrontCopy({ store_type: storeType }, paymentWaysOf(storefront, store)).faqs.find(
      (faq) => faq.q === "What payment methods are supported?",
    )?.a;

  it("names only a Starter store's real ways to pay, for every store type", () => {
    for (const type of ["pharmacy", "retail", "beauty", "hardware"]) {
      expect(paymentsAnswer(starterStore, starterProfile, type)).toBe("You can pay when you collect or on delivery.");
    }
  });

  it("names transfer and online for a store that takes them", () => {
    expect(paymentsAnswer(proStore, proProfile, "retail")).toBe(
      "You can pay when you collect, on delivery, by transfer or mobile money or online.",
    );
  });
});
