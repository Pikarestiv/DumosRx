import type { POLineItemDraft } from "./po-item-ledger-table";

/**
 * Single source of truth for Immediate Purchase cost math. unit_cost is
 * always per bulk unit (e.g. per carton); cost_price_override, when typed
 * into "New Cost", is per single base unit (e.g. per tablet) — the same
 * scale as the catalog's current cost and the sell price entered in
 * "Review price". Every place that needs a line's cost or total must go
 * through these two functions instead of re-deriving the conversion
 * inline: that duplication is exactly how "New Cost", "Total", and
 * "Review price" drifted out of sync with each other before.
 */
export function getImmediateUnitCost(item: POLineItemDraft): number {
  const unitsPerBulk = item.units_per_bulk || 1;
  // Loose `!=` (not `!==`) deliberately also catches `null`: a PO reloaded
  // from the DB hands back SQL NULL for an unset override, not
  // `undefined` - `Number(null)` is `0`, which would silently read back
  // as "override to zero cost" instead of "no override".
  return item.cost_price_override != null && item.cost_price_override !== ""
    ? Number(item.cost_price_override)
    : item.unit_cost / unitsPerBulk;
}

/**
 * Guard for the money override inputs (New Cost / Cost Price / Sell Price)
 * in the order-building and receiving tables. Their `min={0}` is only an
 * HTML hint — nothing stops a negative being typed and stored, which then
 * corrupts stock_batches.cost_price / products.selling_price and every
 * margin calculation downstream. Only a negative is rewritten (to "0");
 * anything else is passed through verbatim so half-typed values like
 * "12." survive until the user finishes the number.
 */
export function clampMoneyInput(raw: string): string {
  if (raw === "") return "";
  return parseFloat(raw) < 0 ? "0" : raw;
}

export function getLineTotal(item: POLineItemDraft, poType: "standard" | "immediate"): number {
  if (poType !== "immediate") return item.bulk_quantity * item.unit_cost;
  const unitsPerBulk = item.units_per_bulk || 1;
  return item.bulk_quantity * unitsPerBulk * getImmediateUnitCost(item);
}

/**
 * Validates the free-text "Amount Paid" field before it's ever written to
 * the PO: `Number(amountPaid) || 0` alone silently records ₦0 paid for a
 * blank/non-numeric input, and accepted any value above the order total
 * as-is with no cap or rounding. Blank/non-numeric/negative all become 0;
 * anything above the order's total is clamped down to it.
 */
export function getValidatedAmountPaid(rawAmountPaid: string, orderTotal: number): number {
  const parsed = Number(rawAmountPaid);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, orderTotal);
}
