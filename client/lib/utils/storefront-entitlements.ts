import type { StorefrontEntitlements } from "@/lib/types/storefront-settings";
import type { SubscriptionPlansConfig } from "@/lib/types/subscription-plans";

export const LOCKED_STOREFRONT: StorefrontEntitlements = {
  storefront_enabled: false,
  allowed_presets: [],
  custom_accent_colour: false,
  max_online_products: null,
  checkout_whatsapp: false,
  checkout_transfer_mobile_money: false,
  checkout_pay_on_delivery: false,
  checkout_paystack: false,
  checkout_flutterwave: false,
  remove_powered_by_badge: false,
  services_on_storefront: false,
  visitor_language_switch: false,
  owner_self_edit_look: false,
  rebuild_mode: "scheduled",
  custom_domain: false,
};

const LEGACY_UNRESTRICTED: StorefrontEntitlements = {
  ...LOCKED_STOREFRONT,
  storefront_enabled: true,
  allowed_presets: ["workshop", "clinic", "studio"],
  custom_accent_colour: true,
  checkout_whatsapp: true,
  checkout_transfer_mobile_money: true,
  checkout_pay_on_delivery: true,
  checkout_paystack: true,
  services_on_storefront: true,
  visitor_language_switch: true,
  owner_self_edit_look: true,
};

export function resolveStorefrontEntitlements(
  plans: SubscriptionPlansConfig | null | undefined,
  planKey: string,
  storeUrlAllowed: boolean,
): StorefrontEntitlements {
  if (!storeUrlAllowed) return LOCKED_STOREFRONT;
  const fromServer = plans?.storefront_entitlements;
  if (!fromServer) return LEGACY_UNRESTRICTED;
  return fromServer[planKey] ?? LOCKED_STOREFRONT;
}

export interface ListingCapState {
  tier?: string;
  applies: boolean;
  cap: number | null;
  listed: number;
  atCap: boolean;
  overCap: boolean;
  remaining: number | null;
}

export function listingCapState(cap: number | null, storefrontOn: boolean, listed: number): ListingCapState {
  if (cap === null || !storefrontOn) {
    return { applies: false, cap, listed, atCap: false, overCap: false, remaining: null };
  }
  return { applies: true, cap, listed, atCap: listed >= cap, overCap: listed > cap, remaining: Math.max(0, cap - listed) };
}

export function refusesNewListing(
  state: ListingCapState,
  { turningOn, alreadyListed }: { turningOn: boolean; alreadyListed: boolean },
): boolean {
  return state.applies && state.atCap && turningOn && !alreadyListed;
}

export function capPlanNames(tier = "pro"): { plan: string; upgradeTo: string } {
  return tier === "starter" || tier === "local" ? { plan: "Starter", upgradeTo: "Pro" } : { plan: "Pro", upgradeTo: "Enterprise" };
}

export function overCapMessage(cap: number, tier?: string): string {
  const { plan, upgradeTo } = capPlanNames(tier);
  return `Your ${plan} plan lists up to ${cap} products online. Turn another product off or upgrade to ${upgradeTo}.`;
}
