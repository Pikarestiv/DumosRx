import { query, insert } from "@/lib/db/local-database";

export interface LoyaltyTierRow {
  id: string;
  name: string;
  min_spend: number;
  points_multiplier: number;
  benefits: string; // JSON-encoded string[]
  color: string;
  sort_order: number;
}

export interface LoyaltyRedemptionOptionRow {
  id: string;
  label: string;
  points_cost: number;
  description: string;
  icon_key: string;
  is_active: number;
  sort_order: number;
}

export const DEFAULT_LOYALTY_TIERS: Omit<LoyaltyTierRow, "id">[] = [
  {
    name: "Bronze",
    min_spend: 0,
    points_multiplier: 1,
    benefits: JSON.stringify(["Basic rewards", "Birthday discount 5%"]),
    color: "bg-amber-600",
    sort_order: 0,
  },
  {
    name: "Silver",
    min_spend: 100000,
    points_multiplier: 1.5,
    benefits: JSON.stringify(["Enhanced rewards", "Birthday discount 10%", "Priority support"]),
    color: "bg-gray-400",
    sort_order: 1,
  },
  {
    name: "Gold",
    min_spend: 300000,
    points_multiplier: 2,
    benefits: JSON.stringify(["Premium rewards", "Birthday discount 15%", "Exclusive offers"]),
    color: "bg-yellow-500",
    sort_order: 2,
  },
  {
    name: "Platinum",
    min_spend: 500000,
    points_multiplier: 3,
    benefits: JSON.stringify(["VIP rewards", "Birthday discount 20%", "Personal specialist", "Early access"]),
    color: "bg-purple-600",
    sort_order: 3,
  },
];

export const DEFAULT_REDEMPTION_OPTIONS: Omit<LoyaltyRedemptionOptionRow, "id">[] = [
  {
    label: "₦500 Discount",
    points_cost: 500,
    description: "Get ₦500 off your next purchase",
    icon_key: "tag",
    is_active: 1,
    sort_order: 0,
  },
  {
    label: "₦1,000 Discount",
    points_cost: 900,
    description: "Get ₦1,000 off your next purchase",
    icon_key: "tag",
    is_active: 1,
    sort_order: 1,
  },
  {
    label: "Free Delivery",
    points_cost: 200,
    description: "Free delivery on your next order",
    icon_key: "truck",
    is_active: 1,
    sort_order: 2,
  },
];

export async function getLoyaltyTiers() {
  return query<LoyaltyTierRow>(
    "SELECT * FROM loyalty_tiers WHERE _deleted = 0 ORDER BY min_spend ASC"
  );
}

export async function getLoyaltyRedemptionOptions() {
  return query<LoyaltyRedemptionOptionRow>(
    "SELECT * FROM loyalty_redemption_options WHERE _deleted = 0 ORDER BY sort_order ASC, points_cost ASC"
  );
}

/**
 * Seeds the app's default tiers/redemption options as real, editable rows the
 * first time settings are opened on a store that has never customized them —
 * keeps existing stores' behavior unchanged until they actually edit something.
 */
export async function ensureLoyaltyDefaultsSeeded(userId?: string) {
  const [tiers, options] = await Promise.all([
    getLoyaltyTiers(),
    getLoyaltyRedemptionOptions(),
  ]);

  if (tiers.length === 0) {
    for (const tier of DEFAULT_LOYALTY_TIERS) {
      await insert("loyalty_tiers", { ...tier, user_id: userId });
    }
  }

  if (options.length === 0) {
    for (const option of DEFAULT_REDEMPTION_OPTIONS) {
      await insert("loyalty_redemption_options", { ...option, user_id: userId });
    }
  }
}
