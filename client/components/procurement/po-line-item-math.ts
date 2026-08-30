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
  return item.cost_price_override !== undefined && item.cost_price_override !== ""
    ? Number(item.cost_price_override)
    : item.unit_cost / unitsPerBulk;
}

export function getLineTotal(item: POLineItemDraft, poType: "standard" | "immediate"): number {
  if (poType !== "immediate") return item.bulk_quantity * item.unit_cost;
  const unitsPerBulk = item.units_per_bulk || 1;
  return item.bulk_quantity * unitsPerBulk * getImmediateUnitCost(item);
}
