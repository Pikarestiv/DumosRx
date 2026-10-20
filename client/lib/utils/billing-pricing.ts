import type { AppliedCoupon } from "@/lib/types/subscription-plans";
import { normalizePlanId } from "@/lib/constants/subscription-plans-catalog";

const PLAN_WEIGHT: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

// Price shown on the card after applying the coupon discount and, when no coupon is applied, referral credits too (matching the referral tab's…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-billing-pricing-ts-L6
export function getDiscountedPrice(
  numericPrice: number,
  appliedCoupon: AppliedCoupon | null,
  userCredits: number,
): number {
  if (numericPrice === 0) return numericPrice;

  let price = numericPrice;

  if (appliedCoupon) {
    const { value, type } = appliedCoupon;
    if (!Number.isFinite(value)) {
      console.warn("[billing-pricing] Ignoring non-finite coupon value:", value);
    } else if (type === "discount_percent") {
      price -= price * (value / 100);
    } else if (type === "discount_amount") {
      price -= value;
    }
  }

  if (userCredits > 0) {
    price -= Math.min(userCredits, Math.max(0, price));
  }

  return Math.max(0, price);
}

/** Whether the card should render a struck-through / discounted display price. */
export function isDiscounted(
  numericPrice: number,
  appliedCoupon: AppliedCoupon | null,
  userCredits: number,
): boolean {
  return numericPrice > 0 && (appliedCoupon !== null || userCredits > 0);
}

// Amount to actually charge via `pay()`.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-billing-pricing-ts-L51
export function getChargeAmount(numericPrice: number, appliedCoupon: AppliedCoupon | null): number {
  if (numericPrice === 0 || !appliedCoupon) return numericPrice;

  const { value, type } = appliedCoupon;
  if (!Number.isFinite(value)) {
    console.warn("[billing-pricing] Ignoring non-finite coupon value:", value);
    return numericPrice;
  }

  let price = numericPrice;
  if (type === "discount_percent") price -= price * (value / 100);
  else if (type === "discount_amount") price -= value;

  return Math.max(0, price);
}

/** True when `planId` is a strictly lower tier than the caller's current plan. */
export function isCurrentPlanHigherWeight(planId: string, currentPlan: string | undefined): boolean {
  const currentWeight = PLAN_WEIGHT[normalizePlanId(currentPlan)] ?? 0;
  return (PLAN_WEIGHT[planId] ?? 0) < currentWeight;
}

/** True when `planId` is the tier the caller is currently subscribed to. */
export function isCurrentPlan(currentPlan: string | undefined, planId: string): boolean {
  return normalizePlanId(currentPlan) === planId;
}
