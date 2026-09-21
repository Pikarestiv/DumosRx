import { query, insert, update } from "@/lib/db/local-database";
import { getActiveStoreId, transaction } from "@/lib/db/core";

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
  /** Value, in the store's currency, this option discounts off a sale at
   * checkout. 0 for non-monetary perks (e.g. "Free Delivery"), which are
   * configurable here but not selectable as a POS checkout redemption. */
  discount_value: number;
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

/** currencySymbol defaults to Naira for callers that predate per-store
 * currency (e.g. tests seeding without a store currency in scope) — pass the
 * store's actual symbol (getCurrencySymbol(storeProfile.currency)) wherever
 * one is available. */
export function buildDefaultRedemptionOptions(
  currencySymbol = "₦",
): Omit<LoyaltyRedemptionOptionRow, "id">[] {
  return [
    {
      label: `${currencySymbol}500 Discount`,
      points_cost: 500,
      discount_value: 500,
      description: `Get ${currencySymbol}500 off your next purchase`,
      icon_key: "tag",
      is_active: 1,
      sort_order: 0,
    },
    {
      label: `${currencySymbol}1,000 Discount`,
      points_cost: 900,
      discount_value: 1000,
      description: `Get ${currencySymbol}1,000 off your next purchase`,
      icon_key: "tag",
      is_active: 1,
      sort_order: 1,
    },
    {
      label: "Free Delivery",
      points_cost: 200,
      discount_value: 0,
      description: "Free delivery on your next order",
      icon_key: "truck",
      is_active: 1,
      sort_order: 2,
    },
  ];
}

export async function getLoyaltyTiers() {
  const storeId = getActiveStoreId();
  return query<LoyaltyTierRow>(
    `SELECT * FROM loyalty_tiers WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""} ORDER BY min_spend ASC`,
    storeId ? [storeId] : [],
  );
}

export async function getLoyaltyRedemptionOptions() {
  const storeId = getActiveStoreId();
  return query<LoyaltyRedemptionOptionRow>(
    `SELECT * FROM loyalty_redemption_options WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""} ORDER BY sort_order ASC, points_cost ASC`,
    storeId ? [storeId] : [],
  );
}

/**
 * Seeds the app's default tiers/redemption options as real, editable rows the
 * first time settings are opened on a store that has never customized them;
 * keeps existing stores' behavior unchanged until they actually edit something.
 *
 * Gated on `stores.loyalty_defaults_seeded_at` rather than "are there zero
 * tiers/options right now" — that count-based check couldn't tell "never
 * seeded" apart from "a store deliberately deleted every tier," so it
 * silently reseeded a store that had cleared its tiers on purpose every time
 * the settings dialog was reopened. Once this flag is set, seeding never
 * runs again for that store, even if it later has zero tiers. A store
 * upgrading from before this flag existed still gets exactly one more
 * grandfather seed-or-skip decision (zero tiers seeds once more, any tiers
 * present just sets the flag) — an accepted, one-time transition edge case.
 */
export async function ensureLoyaltyDefaultsSeeded(userId?: string, currencySymbol?: string) {
  const storeId = getActiveStoreId();
  if (!storeId) return;

  await transaction(async () => {
    const stores = await query<{ id: string; loyalty_defaults_seeded_at: string | null }>(
      "SELECT id, loyalty_defaults_seeded_at FROM stores WHERE id = ?",
      [storeId],
    );
    if (stores.length === 0 || stores[0].loyalty_defaults_seeded_at) return;

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
      for (const option of buildDefaultRedemptionOptions(currencySymbol)) {
        await insert("loyalty_redemption_options", { ...option, user_id: userId });
      }
    }

    await update("stores", storeId, {
      loyalty_defaults_seeded_at: new Date().toISOString(),
    });
  });
}
