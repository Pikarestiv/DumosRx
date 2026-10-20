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

// The highest tier a customer qualifies for given their spend *before* this sale (tiers reward standing history, not the transaction that's ea…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-loyalty-calculator-ts-L13
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

// A sale can both earn and redeem points in the same checkout, and both updates land in a single `customers.loyalty_points` write (rather than…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-loyalty-calculator-ts-L33
export const calculateLoyaltyPointsAfterSale = (
  currentPoints: number,
  earnedPoints: number,
  redeemedPoints: number,
) => {
  return Math.max(0, currentPoints + earnedPoints - redeemedPoints);
};

// A return must undo its proportional share of whatever the original sale did to points — points earned on returned merchandise get clawed bac…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-loyalty-calculator-ts-L47
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

// One `loyalty_transactions` row, as far as expiry math cares:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-loyalty-calculator-ts-L67
export interface LoyaltyLedgerEntry {
  points: number;
  type?: string;
  created_at?: string | null;
}

// Shifts a date back/forward by whole months, clamping to the last day of the target month (so a cutoff computed from the 31st doesn't roll in…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-loyalty-calculator-ts-L76
const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date.getTime());
  const targetMonthDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(targetMonthDay, lastDayOfTargetMonth));
  return result;
};

const parseLedgerDate = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

// EXPIRY SEMANTICS — read this before changing anything here.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-loyalty-calculator-L99
export const calculateExpiredPoints = (
  ledger: LoyaltyLedgerEntry[],
  storedBalance: number,
  now: Date = new Date(),
  expiryMonths: number = LOYALTY_RULES.POINTS_EXPIRY_MONTHS,
): number => {
  if (!ledger?.length || storedBalance <= 0 || expiryMonths <= 0) return 0;

  const cutoff = addMonths(now, -expiryMonths).getTime();

  const sorted = [...ledger].sort((a, b) => {
    const aTime = parseLedgerDate(a.created_at);
    const bTime = parseLedgerDate(b.created_at);
    // Undated rows sort last: treated as "newest", hence never expirable.
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aTime - bTime;
  });

  // Open earn batches, oldest first: { points still open, when earned }.
  const batches: { points: number; earnedAt: number | null }[] = [];

  for (const entry of sorted) {
    const points = Number(entry.points) || 0;
    if (points > 0) {
      batches.push({ points, earnedAt: parseLedgerDate(entry.created_at) });
      continue;
    }

    // Redemption / already-materialized expiry: drain oldest batches first.
    let toDrain = Math.abs(points);
    while (toDrain > 0 && batches.length > 0) {
      const oldest = batches[0];
      const drained = Math.min(oldest.points, toDrain);
      oldest.points -= drained;
      toDrain -= drained;
      if (oldest.points <= 0) batches.shift();
    }
  }

  const expirable = batches.reduce(
    (sum, batch) =>
      batch.earnedAt !== null && batch.earnedAt < cutoff ? sum + batch.points : sum,
    0,
  );

  return Math.min(Math.floor(expirable), Math.floor(storedBalance));
};

// The balance a customer can actually spend right now:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-loyalty-calculator-ts-L151
export const calculateAvailablePoints = (
  storedBalance: number,
  ledger: LoyaltyLedgerEntry[],
  now: Date = new Date(),
  expiryMonths: number = LOYALTY_RULES.POINTS_EXPIRY_MONTHS,
): number =>
  Math.max(
    0,
    storedBalance - calculateExpiredPoints(ledger, storedBalance, now, expiryMonths),
  );

// Returns an error message when a redemption can't go through, or null when it can.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-loyalty-calculator-ts-L165
export const validateRedemption = (
  pointsCost: number,
  availablePoints: number,
  minRedemptionPoints: number = LOYALTY_RULES.MIN_REDEMPTION_POINTS,
): string | null => {
  if (!(pointsCost > 0)) return "This reward has no points cost to redeem";
  if (pointsCost < minRedemptionPoints) {
    return `Rewards must cost at least ${minRedemptionPoints} points to redeem`;
  }
  if (availablePoints < pointsCost) {
    return `Customer only has ${availablePoints} unexpired points — this reward costs ${pointsCost}`;
  }
  return null;
};
