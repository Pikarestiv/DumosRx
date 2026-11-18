import { roundMoney } from "@/lib/utils/pos-calculations";
import { formatCurrency } from "@/lib/utils";
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
    return { items, merged: true };
  }

  const unitsPerBulk = product.units_per_bulk || 1;
  const unitCost = product.cost_price ? product.cost_price * unitsPerBulk : 0;
  return {
    items: [
      {
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        bulk_unit: product.bulk_unit || product.base_unit || "Units",
        bulk_quantity: 0,
        units_per_bulk: unitsPerBulk,
        unit_cost: unitCost,
        subtotal: 0,
      },
      ...items,
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

// A line ordered at zero was saved uncounted; the receiver enters what arrived (receivePurchaseOrder records it).
export function receivableLimit(item: { bulk_quantity: number; quantity_received?: number | null }): number {
  const uncounted = !(Number(item.bulk_quantity) > 0) && !(Number(item.quantity_received) > 0);
  return uncounted ? Number.POSITIVE_INFINITY : outstandingBulkQuantity(item);
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

export type MarginCue = "below_cost" | "thinner";

// Non-blocking: a ₦0 selling price or cost has its own warning, so neither is judged here.
export function getMarginCue({
  unitCost,
  sellingPrice,
  previousCost,
}: {
  unitCost: number;
  sellingPrice?: number | null;
  previousCost?: number | null;
}): MarginCue | null {
  const sell = Number(sellingPrice);
  if (!(unitCost > 0) || !(sell > 0)) return null;
  if (unitCost >= sell) return "below_cost";
  const before = Number(previousCost);
  return before > 0 && unitCost > before ? "thinner" : null;
}

export function dueDateToSave(paymentStatus: string, dueDate: string): string | null {
  return paymentStatus === "paid" ? null : dueDate || null;
}

// The lines on a receipt that carried a real cost override, with the cost that was typed.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-line-item-math-ts-L232
export function costOverriddenLines(
  items: { product_id?: string; cost_price?: number | string; quantity?: number | string }[],
): { productId: string; cost: number }[] {
  return items
    .filter((item) => item.quantity === undefined || Number(item.quantity) > 0)
    .filter((item) => item.cost_price != null && item.cost_price !== "")
    .filter((item): item is { product_id: string; cost_price: number | string } => !!item.product_id)
    .map((item) => ({ productId: item.product_id, cost: Number(item.cost_price) }));
}

export function sellingPriceLabel(currentSellingPrice?: number | null, currencyCode?: string): string {
  return Number(currentSellingPrice) > 0 ? formatCurrency(Number(currentSellingPrice), currencyCode) : "Not set";
}

export function getCatalogSellingPrice(product?: { selling_price?: number | null }): number {
  const catalogPrice = Number(product?.selling_price);
  return Number.isFinite(catalogPrice) ? Math.max(0, catalogPrice) : 0;
}

export function getZeroQuantityLineItems(items: POLineItemDraft[]): POLineItemDraft[] {
  return items.filter((item) => !(Number(item.bulk_quantity) > 0));
}

export function quantityMissingMessage(
  items: POLineItemDraft[],
  displayName: (name: string) => string = (name) => name,
): string | null {
  const missing = getZeroQuantityLineItems(items);
  if (missing.length === 0) return null;
  return `Enter a quantity for ${formatProductNamesList(missing.map((item) => displayName(item.product_name)))}`;
}

export function getZeroCostLineItems(items: POLineItemDraft[]): POLineItemDraft[] {
  return items.filter(
    (item) => Number(item.bulk_quantity) > 0 && getImmediateUnitCost(item) <= 0,
  );
}

export function getZeroSellingPriceLineItems(
  items: POLineItemDraft[],
  products: { id: string; selling_price?: number | null }[],
): POLineItemDraft[] {
  const productMap = new Map(products.map((p) => [p.id, p]));
  return items.filter((item) => {
    if (Number(item.bulk_quantity) <= 0) return false;
    const product = productMap.get(item.product_id);
    return getCatalogSellingPrice(product) <= 0;
  });
}

export function getReceiveZeroCostItems<
  T extends { quantity?: number | string; cost_price?: number | string; po_item_id?: string; product_id?: string },
  P extends { id: string; product_id?: string; unit_cost: number; product_units_per_bulk?: number; units_per_bulk?: number },
>(
  payload: T[],
  poItems: P[],
): { item: T; poItem?: P }[] {
  return payload
    .filter((item) => Number(item.quantity) > 0)
    .map((item) => ({
      item,
      poItem: poItems.find(
        (p) =>
          (item.po_item_id && p.id === item.po_item_id) ||
          (item.product_id && p.product_id === item.product_id) ||
          p.id === item.product_id,
      ),
    }))
    .filter(({ item, poItem }) => {
      if (item.cost_price != null && item.cost_price !== "") {
        return Number(item.cost_price) <= 0;
      }
      if (!poItem) return true;
      const unitsPerBulk =
        poItem.product_units_per_bulk || poItem.units_per_bulk || 1;
      return (
        resolveBaseUnitCost({
          unitCost: poItem.unit_cost,
          unitsPerBulk,
        }) <= 0
      );
    });
}

export function getReceiveZeroSellingPriceItems<
  T extends { quantity?: number | string; po_item_id?: string; product_id?: string },
  P extends { id: string; product_id?: string; current_selling_price?: number | null },
>(
  payload: T[],
  poItems: P[],
): { item: T; poItem?: P }[] {
  return payload
    .filter((item) => Number(item.quantity) > 0)
    .map((item) => ({
      item,
      poItem: poItems.find(
        (p) =>
          (item.po_item_id && p.id === item.po_item_id) ||
          (item.product_id && p.product_id === item.product_id) ||
          p.id === item.product_id,
      ),
    }))
    .filter(({ poItem }) => {
      const livePrice = Number(poItem?.current_selling_price);
      return !Number.isFinite(livePrice) || livePrice <= 0;
    });
}

export function formatProductNamesList(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

export function resolveReceiveButtonLabel(
  hasZeroCost: boolean,
  hasZeroSell: boolean,
): string {
  if (hasZeroCost && hasZeroSell) return "Receive with ₦0 Cost & Sell Price";
  if (hasZeroCost) return "Receive with ₦0 Cost";
  if (hasZeroSell) return "Receive with ₦0 Sell Price";
  return "Receive Purchase";
}
