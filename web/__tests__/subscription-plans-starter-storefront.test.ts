import { describe, it, expect } from "vitest";
import { getSubscriptionPlans, type SubscriptionPlan } from "@/lib/constants/subscription-plans";
import type { SubscriptionConfig } from "@/lib/types/admin";

const starterWith = (storeUrl: boolean, cap: number | "no map" = 50) =>
  ({
    tiers: { starter: { features: { store_url: storeUrl } }, pro: { features: { store_url: true } } },
    ...(cap === "no map" ? {} : { storefront_entitlements: { starter: { max_online_products: cap }, pro: { max_online_products: 300 } } }),
  }) as unknown as SubscriptionConfig;
const pro = (config: SubscriptionConfig) => getSubscriptionPlans(config, true, String).find((plan) => plan.id === "pro") as SubscriptionPlan;
const starter = (config: SubscriptionConfig) => getSubscriptionPlans(config, true, String).find((plan) => plan.id === "starter") as SubscriptionPlan;

describe("Starter's storefront line on the plan cards", () => {
  it("lists the Starter storefront only once a super admin gives Starter the Online Storefront feature", () => {
    expect(starter(starterWith(true)).features).toContain("Online Storefront: up to 50 products, WhatsApp orders, pickup or pay on delivery");
    expect(starter(starterWith(true)).missing).not.toContain("No Online Storefront");

    expect(starter(starterWith(false)).features.join(" ")).not.toMatch(/Online Storefront/);
    expect(starter(starterWith(false)).missing).toContain("No Online Storefront");
  });

  it("reads the cap from the plan map the server computes, so the card follows the entitlement config", () => {
    expect(starter(starterWith(true, 75)).features).toContain("Online Storefront: up to 75 products, WhatsApp orders, pickup or pay on delivery");
    expect(pro(starterWith(true, 50)).features.join(" ")).toContain("up to 300 products");
  });

  it("leaves the number out rather than guessing when the server sends no plan map", () => {
    expect(starter(starterWith(true, "no map")).features).toContain("Online Storefront: WhatsApp orders, pickup or pay on delivery");
    expect(pro(starterWith(true, "no map")).features.join(" ")).not.toMatch(/\d+ products/);
  });

  it("keeps Starter's price untouched", () => {
    expect(starter(starterWith(true)).price).toBe(starter(starterWith(false)).price);
  });
});
