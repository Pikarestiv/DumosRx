import type { SyncQueueItem } from "@/lib/types/sync";
import { query } from "../core";

// Sorts categories to the front of the queue, leaving every other row's relative order untouched.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-push-ts-L66
export function compareCategoriesFirst(
  a: { table_name: string },
  b: { table_name: string },
): number {
  return Number(b.table_name === "categories") - Number(a.table_name === "categories");
}

// MySQL DATETIME rejects the 'T'/'Z' and fractional seconds, so every
// ISO-shaped string field is rewritten before it's sent.
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

export function normalizeDatetimeFields(payload: Record<string, unknown>) {
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (typeof value === "string" && ISO_DATETIME_REGEX.test(value)) {
      payload[key] = value.slice(0, 19).replace("T", " ");
    }
  }
}

// Folds every pending UPDATE for the same (table_name, record_id) into one merged change:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-push-ts-L109
export function coalescePendingUpdates(pending: SyncQueueItem[]): {
  items: SyncQueueItem[];
  mergedIdsByRepId: Map<number, number[]>;
} {
  const indicesByKey = new Map<string, number[]>();
  pending.forEach((item, idx) => {
    if (item.operation !== "UPDATE") return;
    const key = `${item.table_name}::${item.record_id}`;
    const indices = indicesByKey.get(key) ?? [];
    indices.push(idx);
    indicesByKey.set(key, indices);
  });

  const foldedAway = new Set<number>();
  const mergedPayloadByIndex = new Map<number, string>();
  const mergedIdsByRepId = new Map<number, number[]>();

  for (const indices of indicesByKey.values()) {
    if (indices.length <= 1) continue; // Nothing to coalesce for this record.

    const repIndex = indices[0];
    const merged: Record<string, unknown> = {};
    let baseVersion: unknown;

    indices.forEach((idx, position) => {
      const parsed = JSON.parse(pending[idx].payload) as Record<string, unknown>;
      if (position === 0) {
        baseVersion = parsed._version;
      }
      Object.assign(merged, parsed);
    });
    merged._version = baseVersion;

    mergedPayloadByIndex.set(repIndex, JSON.stringify(merged));
    mergedIdsByRepId.set(
      pending[repIndex].id,
      indices.map((idx) => pending[idx].id),
    );
    for (let i = 1; i < indices.length; i++) foldedAway.add(indices[i]);
  }

  const items: SyncQueueItem[] = [];
  pending.forEach((item, idx) => {
    if (foldedAway.has(idx)) return;
    const mergedPayload = mergedPayloadByIndex.get(idx);
    items.push(mergedPayload ? { ...item, payload: mergedPayload } : item);
  });

  return { items, mergedIdsByRepId };
}

// Removes every currently-due UPDATE from `pending` whose record has ANY sibling UPDATE still backed off in `_sync_queue`; INSERT/DELETE are n…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-push-ts-L168
export async function withheldRecordsWithBackedOffSiblingsRemoved(
  pending: SyncQueueItem[],
): Promise<SyncQueueItem[]> {
  const dueCountByKey = new Map<string, number>();
  for (const item of pending) {
    if (item.operation !== "UPDATE") continue;
    const key = `${item.table_name}::${item.record_id}`;
    dueCountByKey.set(key, (dueCountByKey.get(key) ?? 0) + 1);
  }

  if (dueCountByKey.size === 0) return pending;

  const heldBackKeys = new Set<string>();
  for (const [key, dueCount] of dueCountByKey) {
    const separatorIndex = key.indexOf("::");
    const tableName = key.slice(0, separatorIndex);
    const recordId = key.slice(separatorIndex + 2);

    const totalRows = await query<{ total: number }>(
      `SELECT COUNT(*) as total FROM _sync_queue WHERE table_name = ? AND record_id = ? AND operation = 'UPDATE'`,
      [tableName, recordId],
    );
    const totalCount = totalRows[0]?.total ?? 0;

    // More rows than are due means a sibling UPDATE is still backed off.
    if (totalCount > dueCount) {
      heldBackKeys.add(key);
    }
  }

  if (heldBackKeys.size === 0) return pending;

  return pending.filter((item) => {
    if (item.operation !== "UPDATE") return true;
    return !heldBackKeys.has(`${item.table_name}::${item.record_id}`);
  });
}

const OWED_ROW_LOOKAHEAD = 10;

function owedRowSaleId(item: SyncQueueItem): string | null {
  if (item.table_name !== "stock_movements") return null;
  try {
    const payload = JSON.parse(item.payload) as { reference_type?: string; reference_id?: string };
    return payload.reference_type === "backorder" ? payload.reference_id ?? null : null;
  } catch {
    return null;
  }
}

function saleRowIds(items: SyncQueueItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.table_name !== "stock_movements") continue;
    try {
      const payload = JSON.parse(item.payload) as { reference_type?: string; reference_id?: string };
      if (payload.reference_type === "sale" && payload.reference_id) ids.add(payload.reference_id);
    } catch {
      continue;
    }
  }
  return ids;
}

// The server floors a batch's quantity per push, so a sale's −Q and its owed +N must share a push (A-342).
export function chunkPushQueue(items: SyncQueueItem[], size: number): SyncQueueItem[][] {
  const chunks: SyncQueueItem[][] = [];
  let start = 0;
  while (start < items.length) {
    let end = Math.min(start + size, items.length);
    const sales = saleRowIds(items.slice(start, end));
    for (let j = end; j < Math.min(end + OWED_ROW_LOOKAHEAD, items.length); j++) {
      const saleId = owedRowSaleId(items[j]);
      if (saleId && sales.has(saleId)) end = j + 1;
    }
    chunks.push(items.slice(start, end));
    start = end;
  }
  return chunks;
}
