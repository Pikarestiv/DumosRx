/** A single subscription tier's config — feature flags and numeric limits
 * are open-ended (server-defined), so keyed access is left loose on purpose;
 * callers already guard every lookup with a fallback (see useFeatureGate()). */
export interface SubscriptionPlanTier {
  name?: string;
  features?: Record<string, boolean | undefined>;
  limits?: Record<string, number | undefined>;
}

/** The `subscription_plans` system config blob — fetched from the server
 * (with a local SQLite cache) and consumed by useFeatureGate(). */
export interface SubscriptionPlansConfig {
  tiers?: Record<string, SubscriptionPlanTier | undefined>;
}
