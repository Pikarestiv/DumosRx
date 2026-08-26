/** A single subscription tier's config: feature flags and numeric limits
 * are open-ended (server-defined), so keyed access is left loose on purpose;
 * callers already guard every lookup with a fallback (see useFeatureGate()). */
export interface SubscriptionPlanTier {
  name?: string;
  features?: Record<string, boolean | undefined>;
  limits?: Record<string, number | undefined>;
}

/** The `subscription_plans` system config blob: fetched from the server
 * (with a local SQLite cache) and consumed by useFeatureGate(). */
export interface SubscriptionPlansConfig {
  tiers?: Record<string, SubscriptionPlanTier | undefined>;
}

export interface SubscriptionStatus {
  status: "active" | "inactive" | string;
  plan?: string;
  days_remaining?: number;
  is_trial?: boolean;
  expires_at?: string;
  limits?: { sync_interval?: number; staff?: number };
  features?: { auto_backup?: boolean };
}

export interface AppliedCoupon {
  code: string;
  type: string;
  value: number;
  target_plan: string | null;
  target_interval: string | null;
}

export interface PaymentPayload {
  amount: number;
  plan_name: string;
  coupon_code?: string;
  interval?: "monthly" | "yearly";
  use_credits?: boolean;
}

export interface PaymentResponse {
  success: boolean;
  message?: string;
  payment_url?: string;
}

export interface CouponValidationResponse {
  valid: boolean;
  message?: string;
  coupon: AppliedCoupon;
}

export interface ReferredUser {
  id: string;
  name: string;
  store_name: string;
  created_at: string;
  status: "active" | "pending";
}

export interface CreditTransaction {
  id: string;
  type: "earned" | "spent" | "admin_adjustment";
  amount: string;
  description: string;
  created_at: string;
}

export interface ReferralStats {
  referral_code?: string;
  referral_credits?: number;
  referrals: ReferredUser[];
  transactions: CreditTransaction[];
}

export interface BillingTransaction {
  id: string;
  date: string;
  desc: string;
  amount: string | number;
  status: "Success" | "Pending" | "Failed" | string;
  receipt_url?: string;
}
