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

/**
 * The quantity still expected on a purchase-order line: what was ordered,
 * less whatever has already been received against it on an earlier, partial
 * receipt. Receiving was all-or-nothing before `quantity_received` existed,
 * so a row written by an older build reads back null/undefined and its
 * whole ordered quantity is still outstanding.
 */
export function outstandingBulkQuantity(item: {
  bulk_quantity: number;
  quantity_received?: number | null;
}): number {
  const received = Math.max(0, Number(item.quantity_received) || 0);
  return Math.max(0, Number(item.bulk_quantity) - received);
}

/**
 * Guard for the receiving tables' "Qty Received" inputs. Their min/max are
 * only HTML hints: a negative would corrupt on-hand stock at the moment of
 * receipt, and a value above the outstanding balance would book more stock
 * than was ever ordered.
 */
export function clampReceivedQuantity(raw: string, outstanding: number): number {
  const parsed = parseInt(raw) || 0;
  return Math.min(Math.max(0, parsed), Math.max(0, outstanding));
}

export function getLineTotal(item: POLineItemDraft, poType: "standard" | "immediate"): number {
  if (poType !== "immediate") return item.bulk_quantity * item.unit_cost;
  const unitsPerBulk = item.units_per_bulk || 1;
  return item.bulk_quantity * unitsPerBulk * getImmediateUnitCost(item);
}

/**
 * The order's total: every screen that shows an "Estimated total" must go
 * through this rather than reducing over its own formula. The edit page's
 * header used getLineTotal(item, "standard") while its rows rendered as
 * "immediate", and the mobile edit view's drawer used a raw
 * bulk_quantity * unit_cost — three different numbers for the same order
 * once a "New Cost" override was typed.
 */
export function getOrderTotal(
  items: POLineItemDraft[],
  poType: "standard" | "immediate",
): number {
  return items.reduce((sum, item) => sum + getLineTotal(item, poType), 0);
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

/**
 * How many lines carry a real Sell Price override that actually differs
 * from the product's current price - blank/null/undefined all mean "not
 * overridden" (a PO reloaded via getPurchaseOrderById() hands back SQL
 * NULL, not undefined, for an unset override - see coerceOptionalNumber in
 * lib/db/procurement.ts), and retyping the same number the field was
 * prefilled with is not a real change either. Only meaningful for a submit
 * that writes products.selling_price synchronously in the same action -
 * createAndReceivePurchaseOrder does, and so does receivePurchaseOrder;
 * createPurchaseOrder (a Standard order, or an Immediate order saved as a
 * draft) never touches the live product row at all, so a caller must not
 * report a price change from that path even though the same field was
 * filled in - nothing has actually changed yet.
 */
export function countSellingPriceOverrides(
  items: { product_id: string; selling_price?: number | string }[],
  products: { id: string; selling_price?: number | null }[],
): number {
  return items.filter((item) => {
    if (item.selling_price == null || item.selling_price === "") return false;
    const product = products.find((p) => p.id === item.product_id);
    return Number(item.selling_price) !== (product?.selling_price ?? null);
  }).length;
}
