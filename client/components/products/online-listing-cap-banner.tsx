"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useOnlineListingCap } from "@/lib/hooks/use-online-listing-cap";
import { capPlanNames } from "@/lib/utils/storefront-entitlements";

export function OnlineListingCapBanner() {
  const { applies, atCap, overCap, cap, listed, tier } = useOnlineListingCap();

  if (!applies || !atCap) return null;
  const { plan, upgradeTo } = capPlanNames(tier);

  if (overCap) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {listed} products are listed online, but your {plan} plan shows up to {cap}. Turn some off, or upgrade to {upgradeTo} to list them all.
        </span>
      </div>
    );
  }

  return (
    <div role="status" className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        All {cap} online slots on your {plan} plan are in use. Turn a product off to list another, or upgrade to {upgradeTo}.
      </span>
    </div>
  );
}
