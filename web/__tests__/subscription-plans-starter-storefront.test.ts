import { describe, it, expect } from "vitest";
import { getSubscriptionPlans, type SubscriptionPlan } from "@/lib/constants/subscription-plans";
import type { SubscriptionConfig } from "@/lib/types/admin";

const starterWith = (storeUrl: boolean) =>
  ({ tiers: { starter: { features: { store_url: storeUrl } } } }) as unknown as SubscriptionConfig;
const starter = (config: SubscriptionConfig) => getSubscriptionPlans(config, true, String).find((plan) => plan.id === "starter") as SubscriptionPlan;

describe("Starter's storefront line on the plan cards", () => {
  it("lists the Starter storefront only once a super admin gives Starter the Online Storefront feature", () => {
    expect(starter(starterWith(true)).features).toContain("Online Storefront: up to 50 products, WhatsApp orders, pickup or pay on delivery");
    expect(starter(starterWith(true)).missing).not.toContain("No Online Storefront");

    expect(starter(starterWith(false)).features.join(" ")).not.toMatch(/Online Storefront/);
    expect(starter(starterWith(false)).missing).toContain("No Online Storefront");
  });

  it("keeps Starter's price untouched", () => {
    expect(starter(starterWith(true)).price).toBe(starter(starterWith(false)).price);
  });
});
