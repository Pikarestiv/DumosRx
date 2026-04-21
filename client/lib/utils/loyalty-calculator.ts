/**
 * Helper for Loyalty Points Calculation
 */

export const calculateEarnedPoints = (totalAmount: number, pointsPerNaira: number = 0.01) => {
  return Math.floor(totalAmount * pointsPerNaira);
};

export const calculateRedemptionValue = (points: number, nairaPerPoint: number = 1) => {
  return points * nairaPerPoint;
};

export const LOYALTY_RULES = {
  MIN_REDEMPTION_POINTS: 100,
  POINTS_EXPIRY_MONTHS: 12
};
