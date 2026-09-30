import type { StockMovementDbRow } from "@/lib/types/stock-movement";
import {
  ADJUSTMENT_REASON_NOTE_SEPARATOR,
  AUDIT_REFERENCE_TYPE,
  LEGACY_PRODUCT_IMPORT_REASON,
  PRODUCT_IMPORT_REFERENCE_TYPE,
} from "@/lib/constants/stock-adjustments";

export {
  ADJUSTMENT_REFERENCE_TYPE,
  AUDIT_REFERENCE_TYPE,
} from "@/lib/constants/stock-adjustments";

export const ADJUSTMENT_REASONS = [
  { value: "receive_items", label: "Receive items", direction: "increase" },
  { value: "damage", label: "Damage", direction: "decrease" },
  { value: "inventory_count", label: "Inventory count", direction: "either" },
  { value: "loss", label: "Loss", direction: "decrease" },
] as const;

export type AdjustmentReasonValue = (typeof ADJUSTMENT_REASONS)[number]["value"];

export const ALL_ADJUSTMENT_REASONS = "all";

function reasonLabel(value: AdjustmentReasonValue): string {
  return ADJUSTMENT_REASONS.find((r) => r.value === value)?.label ?? value;
}

export function buildAdjustmentReason(
  value: AdjustmentReasonValue,
  note?: string,
): string {
  const trimmed = note?.trim();
  return trimmed ? `${reasonLabel(value)}${ADJUSTMENT_REASON_NOTE_SEPARATOR}${trimmed}` : reasonLabel(value);
}

export function parseAdjustmentReason(reason?: string): { reason: string; note: string } {
  const raw = reason?.trim() ?? "";
  const separatorIndex = raw.indexOf(ADJUSTMENT_REASON_NOTE_SEPARATOR);
  if (separatorIndex === -1) return { reason: raw, note: "" };
  return {
    reason: raw.slice(0, separatorIndex).trim(),
    note: raw.slice(separatorIndex + ADJUSTMENT_REASON_NOTE_SEPARATOR.length).trim(),
  };
}

/** An "increase"/"decrease" reason takes the entered quantity as the amount
 * to move. An "either" reason (Inventory count) takes it as the *counted*
 * on-shelf quantity, so the delta is the difference from what the system
 * currently holds and goes negative when the shelf holds less. */
export function resolveAdjustmentDelta(
  value: AdjustmentReasonValue,
  quantity: number,
  currentStock: number,
): number {
  const direction = ADJUSTMENT_REASONS.find((r) => r.value === value)?.direction;
  if (direction === "decrease") return -Math.abs(quantity);
  if (direction === "increase") return Math.abs(quantity);
  return Math.max(0, quantity) - currentStock;
}

export function isCountedQuantityReason(value: AdjustmentReasonValue): boolean {
  return ADJUSTMENT_REASONS.find((r) => r.value === value)?.direction === "either";
}

export function adjustmentQuantityLabel(value: AdjustmentReasonValue): string {
  return isCountedQuantityReason(value) ? "Counted" : "Quantity";
}

export function computeStockAfter(currentStock: number, delta: number): number {
  return Math.max(0, currentStock + delta);
}

export interface AdjustmentGroup {
  referenceId: string;
  date: string;
  reason: string;
  note: string;
  source: string;
  itemCount: number;
  netQuantity: number;
  products: string[];
  performedBy: string;
  movements: StockMovementDbRow[];
}

export interface AdjustmentFilters {
  search?: string;
  reason?: string;
  from?: string;
  to?: string;
}

function movementDate(row: StockMovementDbRow): string {
  return row.movement_date || row.created_at || "";
}

/** One ledger row per distinct reference_id. A movement with no reference_id
 * (hand-written correction, legacy data) stands alone rather than merging
 * with every other reference-less movement. */
export function groupAdjustmentMovements(
  rows: StockMovementDbRow[],
): AdjustmentGroup[] {
  const byReference = new Map<string, StockMovementDbRow[]>();

  for (const row of rows) {
    if (row.movement_type !== "adjustment") continue;
    if (row.reference_type === PRODUCT_IMPORT_REFERENCE_TYPE) continue;
    if (
      row.reference_type === AUDIT_REFERENCE_TYPE &&
      parseAdjustmentReason(row.reason).reason === LEGACY_PRODUCT_IMPORT_REASON
    ) {
      continue;
    }
    const key = row.reference_id || `movement:${row.id}`;
    const existing = byReference.get(key);
    if (existing) existing.push(row);
    else byReference.set(key, [row]);
  }

  const groups: AdjustmentGroup[] = [];
  for (const [key, movements] of byReference) {
    const parsed = parseAdjustmentReason(movements[0]?.reason);
    const productNames = new Set<string>();
    const productIds = new Set<string>();
    let netQuantity = 0;
    let date = "";

    for (const movement of movements) {
      productIds.add(movement.product_id);
      if (movement.product_name) productNames.add(movement.product_name);
      netQuantity += movement.quantity || 0;
      const current = movementDate(movement);
      if (current > date) date = current;
    }

    groups.push({
      referenceId: movements[0]?.reference_id || key,
      date,
      reason: parsed.reason,
      note: parsed.note,
      source: movements[0]?.reference_type || "",
      itemCount: productIds.size,
      netQuantity,
      products: [...productNames].sort((a, b) => a.localeCompare(b)),
      performedBy: movements[0]?.performed_by_name?.trim() || "System",
      movements,
    });
  }

  return groups.sort((a, b) => b.date.localeCompare(a.date));
}

export function filterAdjustmentGroups(
  groups: AdjustmentGroup[],
  { search, reason, from, to }: AdjustmentFilters,
): AdjustmentGroup[] {
  const term = search?.trim().toLowerCase() ?? "";
  const reasonFilter =
    reason && reason !== ALL_ADJUSTMENT_REASONS
      ? reasonLabel(reason as AdjustmentReasonValue).toLowerCase()
      : "";

  return groups.filter((group) => {
    if (term) {
      const matches =
        group.referenceId.toLowerCase().includes(term) ||
        group.products.some((name) => name.toLowerCase().includes(term));
      if (!matches) return false;
    }
    if (reasonFilter && group.reason.toLowerCase() !== reasonFilter) return false;
    const day = group.date.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}
