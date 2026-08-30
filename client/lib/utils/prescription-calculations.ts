/**
 * Pure functions for prescription medication cost math, so they can be unit
 * tested independently of the new-prescription form's React state.
 */

/** A prescription medication line's total cost is always unit cost × quantity
 * — computed, never separately typed, so there's no way for staff to enter a
 * per-unit price where a line total was expected (or vice versa). */
export function calculatePrescriptionItemCost(
  unitCost: number,
  quantity: number,
): number {
  if (unitCost < 0 || quantity < 0) return 0;
  return unitCost * quantity;
}
