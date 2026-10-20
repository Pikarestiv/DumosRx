import { roundMoney } from "@/lib/utils/pos-calculations";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";

// Adding a product to the order being built.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L5
export function addOrMergeLineItem(
  items: POLineItemDraft[],
  product: POProduct,
): { items: POLineItemDraft[]; merged: boolean } {
  const existingIndex = items.findIndex((i) => i.product_id === product.id);
  if (existingIndex >= 0) {
    const next = [...items];
    const existing = next[existingIndex];
    next[existingIndex] = {
      ...existing,
      bulk_quantity: existing.bulk_quantity + 1,
    };
    return { items: next, merged: true };
  }

  const unitsPerBulk = product.units_per_bulk || 1;
  const unitCost = product.cost_price ? product.cost_price * unitsPerBulk : 0;
  return {
    items: [
      ...items,
      {
        product_id: product.id,
        product_name: product.name,
        bulk_unit: product.bulk_unit || "Carton",
        bulk_quantity: 1,
        units_per_bulk: unitsPerBulk,
        unit_cost: unitCost,
        subtotal: unitCost,
      },
    ],
    merged: false,
  };
}

// Single source of truth for cost math on BOTH the Immediate Purchase and the Receive-goods flows.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L47
export function resolveBaseUnitCost({
  costOverride,
  unitCost,
  unitsPerBulk,
}: {
  costOverride?: number | string | null;
  unitCost: number;
  unitsPerBulk?: number | null;
}): number {
  const safeUnitsPerBulk = Number(unitsPerBulk) || 1;
  // Loose `!=` (not `!==`) deliberately also catches `null`:
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-procurement-po-line-item-math-ts-L68
  const resolved =
    costOverride != null && costOverride !== ""
      ? Number(costOverride)
      : Number(unitCost) / safeUnitsPerBulk;
  // Rounded because the result is stored - A-261.
  return Number.isFinite(resolved) ? roundMoney(Math.max(0, resolved)) : 0;
}

export function getImmediateUnitCost(item: POLineItemDraft): number {
  return resolveBaseUnitCost({
    costOverride: item.cost_price_override,
    unitCost: item.unit_cost,
    unitsPerBulk: item.units_per_bulk,
  });
}

// Guard for the money override inputs (New Cost / Cost Price / Sell Price) in the order-building and receiving tables.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L88
export function clampMoneyInput(raw: string): string {
  if (raw === "") return "";
  return parseFloat(raw) < 0 ? "0" : raw;
}

// The quantity still expected on a purchase-order line:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L102
export function outstandingBulkQuantity(item: {
  bulk_quantity: number;
  quantity_received?: number | null;
}): number {
  const received = Math.max(0, Number(item.quantity_received) || 0);
  return Math.max(0, Number(item.bulk_quantity) - received);
}

// Guard for the receiving tables' "Qty Received" inputs.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L117
export function clampReceivedQuantity(raw: string, outstanding: number): number {
  const parsed = parseInt(raw) || 0;
  return Math.min(Math.max(0, parsed), Math.max(0, outstanding));
}

// The amount a line is invoiced at:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L128
export function immediateLineAmount(item: {
  bulk_quantity: number;
  unit_cost: number;
  units_per_bulk?: number | null;
  cost_price_override?: number | string | null;
}): number {
  const hasOverride =
    item.cost_price_override != null && item.cost_price_override !== "";
  if (!hasOverride) return item.bulk_quantity * Number(item.unit_cost);
  const unitsPerBulk = Number(item.units_per_bulk) || 1;
  return (
    item.bulk_quantity *
    unitsPerBulk *
    resolveBaseUnitCost({
      costOverride: item.cost_price_override,
      unitCost: item.unit_cost,
      unitsPerBulk: item.units_per_bulk,
    })
  );
}

export function getLineTotal(item: POLineItemDraft, poType: "standard" | "immediate"): number {
  if (poType !== "immediate") return item.bulk_quantity * item.unit_cost;
  return roundMoney(immediateLineAmount(item));
}

// The order's total: every screen that shows an "Estimated total" must go through this rather than reducing over its own f…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L160
export function getOrderTotal(
  items: POLineItemDraft[],
  poType: "standard" | "immediate",
): number {
  return roundMoney(
    items.reduce((sum, item) => sum + getLineTotal(item, poType), 0),
  );
}

// Validates the free-text "Amount Paid" field before it's ever written to the PO:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L177
export function getValidatedAmountPaid(rawAmountPaid: string, orderTotal: number): number {
  const parsed = Number(rawAmountPaid);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  // Rounded because it is stored: "1000.005" was written verbatim.
  return roundMoney(Math.min(parsed, orderTotal));
}

// The base units an Immediate Purchase will actually add to stock:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L191
export function getTotalBaseUnits(items: POLineItemDraft[]): number {
  return items.reduce(
    (sum, item) =>
      sum + Number(item.bulk_quantity) * (Number(item.units_per_bulk) || 1),
    0,
  );
}

// How many lines carry a real Sell Price override that actually differs from the product's current price - blank/null/unde…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L207
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

// The lines on a receipt that carried a real cost override, with the cost that was typed.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L232
export function costOverriddenLines(
  items: { product_id?: string; cost_price?: number | string }[],
): { productId: string; cost: number }[] {
  return items
    .filter((item) => item.cost_price != null && item.cost_price !== "")
    .filter((item): item is { product_id: string; cost_price: number | string } => !!item.product_id)
    .map((item) => ({ productId: item.product_id, cost: Number(item.cost_price) }));
}
