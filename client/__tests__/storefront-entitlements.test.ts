import { describe, it, expect } from "vitest";
import {
  LOCKED_STOREFRONT,
  listingCapState,
  overCapMessage,
  refusesNewListing,
  resolveStorefrontEntitlements,
} from "@/lib/utils/storefront-entitlements";
import type { StorefrontEntitlements } from "@/lib/types/storefront-settings";

const pro: StorefrontEntitlements = {
  ...LOCKED_STOREFRONT,
  storefront_enabled: true,
  allowed_presets: ["workshop", "clinic", "market"],
  max_online_products: 300,
  checkout_transfer_mobile_money: true,
  checkout_pay_on_delivery: true,
  checkout_whatsapp: true,
};

describe("resolveStorefrontEntitlements", () => {
  it("takes the server's entitlements for the store's plan", () => {
    expect(resolveStorefrontEntitlements({ storefront_entitlements: { pro } }, "pro", true)).toEqual(pro);
  });

  it("locks everything when the plan editor withholds store_url, whatever the server map says", () => {
    expect(resolveStorefrontEntitlements({ storefront_entitlements: { pro } }, "pro", false)).toEqual(LOCKED_STOREFRONT);
  });

  it("falls back to the old unrestricted storefront on a server that predates plan entitlements", () => {
    const legacy = resolveStorefrontEntitlements({ tiers: {} }, "pro", true);

    expect(legacy.storefront_enabled).toBe(true);
    expect(legacy.max_online_products).toBeNull();
    expect(legacy.checkout_paystack).toBe(true);
    expect(legacy.rebuild_mode).toBe("scheduled");
  });

  it("is locked with no plan config loaded and no store_url", () => {
    expect(resolveStorefrontEntitlements(null, "free", false)).toEqual(LOCKED_STOREFRONT);
  });
});

describe("listing cap", () => {
  it("does not apply without a cap or while the storefront is off", () => {
    expect(listingCapState(null, true, 900).applies).toBe(false);
    expect(listingCapState(300, false, 900).applies).toBe(false);
  });

  it("reports room, a full listing and an over-full one", () => {
    expect(listingCapState(300, true, 299)).toMatchObject({ applies: true, atCap: false, overCap: false, remaining: 1 });
    expect(listingCapState(300, true, 300)).toMatchObject({ atCap: true, overCap: false, remaining: 0 });
    expect(listingCapState(300, true, 301)).toMatchObject({ atCap: true, overCap: true, remaining: 0 });
  });

  it("refuses only a new listing at the cap, never one already listed or one being hidden", () => {
    const full = listingCapState(300, true, 300);

    expect(refusesNewListing(full, { turningOn: true, alreadyListed: false })).toBe(true);
    expect(refusesNewListing(full, { turningOn: true, alreadyListed: true })).toBe(false);
    expect(refusesNewListing(full, { turningOn: false, alreadyListed: false })).toBe(false);
    expect(refusesNewListing(listingCapState(300, true, 299), { turningOn: true, alreadyListed: false })).toBe(false);
  });

  it("names the cap in the message the owner sees", () => {
    expect(overCapMessage(300)).toBe("Your Pro plan lists up to 300 products online. Turn another product off or upgrade to Enterprise.");
    expect(overCapMessage(50, "starter")).toBe("Your Starter plan lists up to 50 products online. Turn another product off or upgrade to Pro.");
    expect(overCapMessage(50, "local")).toMatch(/Starter plan.*upgrade to Pro/);
  });
});
