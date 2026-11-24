import { Check } from "lucide-react";
import type { StorefrontEntitlements } from "@/lib/types/storefront-settings";
import { EnterpriseBadge } from "./enterprise-badge";
import { joinLabels } from "./storefront-preset-options";

const ENTERPRISE_FEATURES: { key: keyof StorefrontEntitlements; label: string }[] = [
  { key: "owner_self_edit_look", label: "Change the look and details yourself" },
  { key: "custom_accent_colour", label: "Your own accent colour" },
  { key: "visitor_language_switch", label: "Let customers switch language" },
  { key: "services_on_storefront", label: "List your services" },
  { key: "checkout_paystack", label: "Card payments online" },
  { key: "remove_powered_by_badge", label: "Remove the Powered by DumosRx badge" },
];

export function StorefrontPlanFeatures({ entitlements }: { entitlements: StorefrontEntitlements }) {
  const locked = ENTERPRISE_FEATURES.filter(({ key }) => !entitlements[key]);
  const scheduled = entitlements.rebuild_mode === "scheduled";

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
      {locked.length > 0 || scheduled ? (
        <ul className="space-y-2 text-sm">
          {locked.map(({ key, label }) => (
            <li key={key} className="flex items-center justify-between gap-2 rounded-lg border p-2">
              <span>{label}</span>
              <EnterpriseBadge />
            </li>
          ))}
          {scheduled ? (
            <li className="flex items-center justify-between gap-2 rounded-lg border p-2">
              <span>Publish changes instantly</span>
              <EnterpriseBadge />
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-primary" /> Every storefront feature is on your plan.
        </p>
      )}
      {locked.length > 0 ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">
          Upgrade to Enterprise to unlock every style, your own colours, card payments and instant publishing.
        </p>
      ) : null}
    </div>
  );
}
