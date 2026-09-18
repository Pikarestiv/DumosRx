/**
 * Helper for Loyalty Points Calculation
 */

export const calculateEarnedPoints = (
  totalAmount: number,
  pointsPerNaira: number = 0.01,
  tierMultiplier: number = 1,
) => {
  return Math.floor(totalAmount * pointsPerNaira * tierMultiplier);
};

/** The highest tier a customer qualifies for given their spend *before* this
 * sale (tiers reward standing history, not the transaction that's earning
 * points right now), used to multiply the points that transaction earns.
 * Falls back to 1x when there are no tiers configured yet (e.g. a store that
 * has never opened Loyalty Settings, so ensureLoyaltyDefaultsSeeded hasn't
 * run) so earning behaves exactly as it did before tiers existed. */
export const getApplicableTierMultiplier = (
  tiers: { min_spend: number; points_multiplier: number }[],
  totalSpentBeforeSale: number,
): number => {
  const qualifying = tiers
    .filter((t) => totalSpentBeforeSale >= t.min_spend)
    .sort((a, b) => b.min_spend - a.min_spend);
  return qualifying[0]?.points_multiplier ?? 1;
};

export const calculateRedemptionValue = (points: number, nairaPerPoint: number = 1) => {
  return points * nairaPerPoint;
};

/** A sale can both earn and redeem points in the same checkout, and both
 * updates land in a single `customers.loyalty_points` write (rather than two
 * separate reads-then-writes that could stomp each other) — this computes
 * that one resulting balance. Floored at 0 so a redemption can never leave a
 * customer with a negative balance even in a race with another concurrent
 * spend of the same points. */
export const calculateLoyaltyPointsAfterSale = (
  currentPoints: number,
  earnedPoints: number,
  redeemedPoints: number,
) => {
  return Math.max(0, currentPoints + earnedPoints - redeemedPoints);
};

/** A return must undo its proportional share of whatever the original sale
 * did to points — points earned on returned merchandise get clawed back,
 * and points spent on a reward get refunded since the discount it bought is
 * being reversed too. `returnShare` is the same items-returned fraction used
 * to prorate the refund itself (1 for a full return, less for a partial
 * one), so a partial return only undoes its matching partial share. */
export const calculateReturnPointsAdjustment = (
  pointsEarned: number,
  pointsRedeemed: number,
  returnShare: number,
) => ({
  clawback: Math.floor((pointsEarned || 0) * returnShare),
  refund: Math.floor((pointsRedeemed || 0) * returnShare),
});

export const LOYALTY_RULES = {
  MIN_REDEMPTION_POINTS: 100,
  POINTS_EXPIRY_MONTHS: 12
};
