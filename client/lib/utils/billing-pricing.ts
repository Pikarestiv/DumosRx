import type { AppliedCoupon } from "@/lib/types/subscription-plans";
import { normalizePlanId } from "@/lib/constants/subscription-plans-catalog";

const PLAN_WEIGHT: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

/**
 * Price shown on the card after applying the coupon discount and, when no
 * coupon is applied, referral credits too (matching the referral tab's copy:
 * "Automatically applied at checkout"). This is a display estimate only --
 * it must never be passed as the `amount` sent to `pay()`. The server
 * applies referral credits itself via `use_credits`, so subtracting them
 * here AND sending `use_credits: true` would double-count them. Use
 * `getChargeAmount` for the amount actually sent to `pay()`.
 */
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

/**
 * Amount to actually charge via `pay()`. Only the coupon discount reduces
 * this figure client-side; referral credits are intentionally NOT
 * subtracted here since `use_credits: true` already tells the server to
 * apply them -- the server is the source of truth for the final charge.
 */
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
