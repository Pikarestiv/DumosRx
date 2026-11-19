import type { StockBatch } from "@/lib/types/stock-batch";
import { roundMoney } from "@/lib/utils/pos-calculations";

export const UNUSUAL_COST_FACTOR = 5;

type CostedBatch = Pick<StockBatch, "id" | "quantity" | "cost_price" | "expiry_date" | "created_at" | "is_active" | "batch_number">;

const expiryOf = (b: CostedBatch) => b.expiry_date?.trim() || "";
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isHeld = (b: CostedBatch) => b.is_active !== 0 && b.quantity > 0;
const costOf = (b: CostedBatch) => Number(b.cost_price ?? 0) || 0;
export const todayUtc = () => new Date().toISOString().slice(0, 10);

export function isSoldOut(b: CostedBatch): boolean {
  return b.quantity <= 0;
}

export function fefoSellOrder<T extends CostedBatch>(batches: T[], today = todayUtc()): T[] {
  return batches
    .filter((b) => isHeld(b) && (!expiryOf(b) || expiryOf(b).slice(0, 10) > today))
    .sort((a, b) => {
      if (!expiryOf(a) !== !expiryOf(b)) return expiryOf(a) ? -1 : 1;
      return compareText(expiryOf(a), expiryOf(b)) || compareText(a.created_at ?? "", b.created_at ?? "");
    });
}

export function batchesSellingBefore<T extends CostedBatch>(batches: T[], batchId: string, today = todayUtc()): T[] {
  const order = fefoSellOrder(batches, today);
  const index = order.findIndex((b) => b.id === batchId);
  return index > 0 ? order.slice(0, index) : [];
}

export interface AverageTerm {
  units: number;
  cost: number;
}

export function averageCostTerms(batches: CostedBatch[]): { terms: AverageTerm[]; units: number; average: number | null } {
  const byCost = new Map<number, number>();
  for (const b of batches.filter(isHeld)) byCost.set(costOf(b), (byCost.get(costOf(b)) ?? 0) + b.quantity);
  const terms = [...byCost].map(([cost, units]) => ({ cost, units })).sort((a, b) => b.units - a.units);
  const units = terms.reduce((sum, t) => sum + t.units, 0);
  const average = units > 0 ? terms.reduce((sum, t) => sum + t.units * t.cost, 0) / units : null;
  return { terms, units, average };
}

export function stockValue(batches: CostedBatch[]): number {
  return roundMoney(batches.filter(isHeld).reduce((sum, b) => sum + b.quantity * costOf(b), 0));
}

export function lastReceivedBatch<T extends CostedBatch>(batches: T[]): T | null {
  const received = batches.filter((b) => costOf(b) > 0 && !(b.batch_number ?? "").startsWith("ADJ-"));
  return received.sort((a, b) => compareText(b.created_at ?? "", a.created_at ?? ""))[0] ?? null;
}

export interface Change {
  from: number;
  to: number;
}

export interface BatchCostPreview {
  batchCost: Change;
  average: Change | null;
  stockValue: Change;
  profitPerUnit: Change | null;
}

export function previewBatchCostChange(
  batches: CostedBatch[],
  batchId: string,
  newCost: number,
  sellingPrice?: number | null,
): BatchCostPreview {
  const edited = batches.find((b) => b.id === batchId);
  const from = edited ? costOf(edited) : 0;
  const to = roundMoney(newCost);
  const after = batches.map((b) => (b.id === batchId ? { ...b, cost_price: to } : b));
  const averageFrom = averageCostTerms(batches).average;
  const averageTo = averageCostTerms(after).average;
  return {
    batchCost: { from, to },
    average: averageFrom == null || averageTo == null ? null : { from: roundMoney(averageFrom), to: roundMoney(averageTo) },
    stockValue: { from: stockValue(batches), to: stockValue(after) },
    profitPerUnit: sellingPrice != null && sellingPrice > 0
      ? { from: roundMoney(sellingPrice - from), to: roundMoney(sellingPrice - to) }
      : null,
  };
}

export type UnusualCost = { kind: "zero" } | { kind: "far"; reference: number } | null;

export function unusualCostWarning(batches: CostedBatch[], batchId: string, newCost: number): UnusualCost {
  if (!Number.isFinite(newCost)) return null;
  if (newCost === 0) return { kind: "zero" };
  const others = batches
    .filter((b) => b.id !== batchId)
    .map(costOf)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  if (others.length === 0) return null;
  const middle = Math.floor(others.length / 2);
  const reference = others.length % 2 ? others[middle] : (others[middle - 1] + others[middle]) / 2;
  const far = newCost >= reference * UNUSUAL_COST_FACTOR || newCost * UNUSUAL_COST_FACTOR <= reference;
  return far ? { kind: "far", reference: roundMoney(reference) } : null;
}
