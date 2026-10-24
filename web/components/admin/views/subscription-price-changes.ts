import type { SubscriptionConfig } from "@/lib/types/admin";

type TierKey = keyof SubscriptionConfig["tiers"];

const TIER_LABELS: Record<TierKey, string> = {
  free: "Free Plan",
  starter: "Starter Plan",
  pro: "Dumos Pro",
  enterprise: "Enterprise",
};

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

export function describePriceChanges(
  saved: SubscriptionConfig,
  edited: SubscriptionConfig,
): string[] {
  return (Object.keys(TIER_LABELS) as TierKey[]).flatMap((tierKey) => {
    const next = edited.tiers[tierKey];
    const prev = saved.tiers[tierKey];
    const changes: string[] = [];
    if (next.price_monthly !== prev.price_monthly) {
      changes.push(
        `${TIER_LABELS[tierKey]} monthly ${naira(prev.price_monthly)} → ${naira(next.price_monthly)}`,
      );
    }
    if (next.price_yearly !== prev.price_yearly) {
      changes.push(
        `${TIER_LABELS[tierKey]} yearly ${naira(prev.price_yearly)} → ${naira(next.price_yearly)}`,
      );
    }
    return changes;
  });
}
