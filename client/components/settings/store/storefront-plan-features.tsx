import { Check } from "lucide-react";
import type { StorefrontEntitlements } from "@/lib/types/storefront-settings";
import { useSystemConfigStore } from "@/lib/store/system-config-store";
import { PlanBadge } from "./enterprise-badge";
import { joinLabels } from "./storefront-preset-options";

type Lock = { label: string; plan: "Pro" | "Enterprise" };

const PLAN_FEATURES: { key: keyof StorefrontEntitlements; label: string }[] = [
  { key: "checkout_transfer_mobile_money", label: "Bank transfer and mobile money at checkout" },
  { key: "owner_self_edit_look", label: "Change the look and details yourself" },
  { key: "custom_accent_colour", label: "Your own accent colour" },
  { key: "visitor_language_switch", label: "Let customers switch language" },
  { key: "services_on_storefront", label: "List your services" },
  { key: "checkout_paystack", label: "Card payments online" },
  { key: "remove_powered_by_badge", label: "Remove the Powered by DumosRx badge" },
];

function locksFor(entitlements: StorefrontEntitlements, pro: StorefrontEntitlements | undefined): Lock[] {
  const onPro = (granted: boolean): Lock["plan"] => (granted ? "Pro" : "Enterprise");
  const locks: Lock[] = [];
  if (pro && pro.allowed_presets.length > entitlements.allowed_presets.length) locks.push({ label: "More styles", plan: "Pro" });
  const cap = entitlements.max_online_products;
  if (pro && cap !== null && (pro.max_online_products === null || pro.max_online_products > cap)) {
    locks.push({ label: pro.max_online_products === null ? "Unlimited products online" : `Up to ${pro.max_online_products} products online`, plan: "Pro" });
  }
  PLAN_FEATURES.filter(({ key }) => !entitlements[key]).forEach(({ key, label }) => locks.push({ label, plan: onPro(Boolean(pro?.[key])) }));
  if (entitlements.rebuild_mode === "scheduled") locks.push({ label: "Publish changes instantly", plan: onPro(pro?.rebuild_mode === "on_demand") });
  return locks;
}

export function StorefrontPlanFeatures({ entitlements }: { entitlements: StorefrontEntitlements }) {
  const pro = useSystemConfigStore((state) => state.subscriptionPlans?.storefront_entitlements?.pro);
  const locks = locksFor(entitlements, pro);
  const scheduled = entitlements.rebuild_mode === "scheduled";
  const proUnlocks = locks.some((lock) => lock.plan === "Pro");

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Your storefront plan</h4>
        <p className="text-xs text-muted-foreground">
          Your account manager sets your look. Styles on your plan: {joinLabels(entitlements.allowed_presets)}.
          {entitlements.max_online_products !== null ? ` Up to ${entitlements.max_online_products} products online.` : ""}
          {scheduled ? " Changes to your home page appear the next morning; prices and stock are always current." : ""}
        </p>
      </div>
      {locks.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {locks.map(({ label, plan }) => (
            <li key={label} className="flex items-center justify-between gap-2 rounded-lg border p-2">
              <span>{label}</span>
              <PlanBadge plan={plan} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-primary" /> Every storefront feature is on your plan.
        </p>
      )}
      {proUnlocks ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">
          Upgrade to Pro for more styles, more products online and transfer payments, or to Enterprise for card payments, your own colours and instant publishing.
        </p>
      ) : locks.some((lock) => lock.label !== "Publish changes instantly") ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">
          Upgrade to Enterprise to unlock every style, your own colours, card payments and instant publishing.
        </p>
      ) : null}
    </div>
  );
}
