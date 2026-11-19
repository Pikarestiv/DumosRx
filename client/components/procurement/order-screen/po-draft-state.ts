import type { POLineItemDraft } from "../po-item-ledger-table";

export interface PoDraft {
  supplierId: string;
  notes: string;
  items: POLineItemDraft[];
  paidInFull: boolean;
  amountPaid: string;
  dueDate: string;
  paymentTouched: boolean;
}

export type SaveMode = "now" | "debounced";

export const UNDO_GROUP_MS = 1000;
export const UNDO_LIMIT = 50;

export interface UndoHistory {
  stack: PoDraft[];
  lastPushAt: number;
}

export function recordUndo(history: UndoHistory, previous: PoDraft, at: number, mode: SaveMode): UndoHistory {
  const grouped = mode === "debounced" && at - history.lastPushAt < UNDO_GROUP_MS;
  if (grouped) return { ...history, lastPushAt: at };
  return { stack: [...history.stack, previous].slice(-UNDO_LIMIT), lastPushAt: at };
}

export function takeUndo(history: UndoHistory): { history: UndoHistory; draft: PoDraft | null } {
  const draft = history.stack.at(-1) ?? null;
  return { history: { stack: history.stack.slice(0, -1), lastPushAt: 0 }, draft };
}

export function itemsChangeMode(previous: POLineItemDraft[], next: POLineItemDraft[]): SaveMode {
  return previous.length === next.length ? "debounced" : "now";
}

export type RevertableField = "bulk_quantity" | "cost_price_override" | "lot_number" | "expiry_date";

export const REVERTABLE_FIELDS: RevertableField[] = ["bulk_quantity", "cost_price_override", "lot_number", "expiry_date"];

function normalised(value: unknown): string {
  return value == null ? "" : String(value);
}

export function changedFields(line: POLineItemDraft, baseline?: POLineItemDraft): RevertableField[] {
  if (!baseline) return [];
  return REVERTABLE_FIELDS.filter((field) => normalised(line[field]) !== normalised(baseline[field]));
}

export function revertField(items: POLineItemDraft[], lineId: string, field: RevertableField, baseline: POLineItemDraft): POLineItemDraft[] {
  return items.map((item) => (item.id === lineId ? { ...item, [field]: baseline[field] } : item));
}
