/**
 * Pure functions for prescription medication cost math, so they can be unit
 * tested independently of the new-prescription form's React state.
 */

import { roundMoney } from "./pos-calculations";

/** A prescription medication line's total cost is always unit cost × quantity
 * — computed, never separately typed, so there's no way for staff to enter a
 * per-unit price where a line total was expected (or vice versa). Rounded to
 * the cent like every other money value written to a REAL column (see
 * pos-calculations.ts's roundMoney), otherwise float drift compounds across
 * a multi-line prescription and a report's SUM() stops tying out to the
 * displayed line totals. */
export function calculatePrescriptionItemCost(
  unitCost: number,
  quantity: number,
): number {
  if (unitCost < 0 || quantity < 0) return 0;
  return roundMoney(unitCost * quantity);
}
