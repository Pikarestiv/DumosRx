/**
 * Pure functions for prescription medication cost math, so they can be unit
 * tested independently of the new-prescription form's React state.
 */

import { roundMoney } from "./pos-calculations";

// A prescription medication line's total cost is always unit cost × quantity — computed, never separately typed, so there's no way for staff t…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-prescription-calculations-ts-L8
export function calculatePrescriptionItemCost(
  unitCost: number,
  quantity: number,
): number {
  if (unitCost < 0 || quantity < 0) return 0;
  return roundMoney(unitCost * quantity);
}
