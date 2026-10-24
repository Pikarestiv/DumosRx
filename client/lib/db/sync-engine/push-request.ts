import type { SyncChange, SyncQueueItem } from "@/lib/types/sync";
import { query } from "../core";
import { isUuid } from "@/lib/utils/uuid";
import { normalizeDatetimeFields } from "./push-queue-prep";

export type PushRejection = { id: number; reason: string };

export async function mapBatchPayloads(batch: SyncQueueItem[]): Promise<SyncChange[]> {
  return Promise.all(
    batch.map(async (item) => {
      const payload = JSON.parse(item.payload);
      delete payload._deleted;
      // _version is intentionally kept — the server's conflict check
      // needs it (see client/AGENTS.md, "Push details").
      delete payload._synced;
      delete payload._synced_at;

      // The frozen payload's _version can already be stale; re-read the
      // current one (client/AGENTS.md, "Push details").
      if (item.operation === "UPDATE") {
        // Falls back to the frozen value so one bad row can't reject the
        // whole batch's Promise.all.
        try {
          const current = await query<{ _version: number }>(
            `SELECT _version FROM ${item.table_name} WHERE id = ?`,
            [item.record_id],
          );
          if (current[0]?._version !== undefined) {
            payload._version = current[0]._version;
          }
        } catch (err) {
          console.warn(
            `[Sync] Failed to re-read current _version for ${item.table_name}/${item.record_id}, sending the frozen value instead:`,
            err,
          );
        }
      }

      normalizeDatetimeFields(payload);

      return {
        ...item,
        payload,
      };
    }),
  );
}

export function filterPushableChanges(
  mapped: SyncChange[],
  idsFor: (repId: number) => number[],
  rejected: PushRejection[],
): SyncChange[] {
  return mapped.filter((item) => {
    if (item.table_name === "products") {
      // Stale columns still present in payloads queued before the server
      // dropped them; strip rather than reject the whole row.
      delete item.payload.brand_name;
      delete item.payload.supplier_id;

      // Prevent bad payloads from blocking the entire sync queue
      if (
        item.payload.category_id &&
        !isUuid(item.payload.category_id)
      ) {
        for (const id of idsFor(item.id)) {
          rejected.push({ id, reason: "Invalid category_id (not a UUID)" });
        }
        return false;
      }
      if (
        item.payload.supplier_id &&
        !isUuid(item.payload.supplier_id)
      ) {
        for (const id of idsFor(item.id)) {
          rejected.push({ id, reason: "Invalid supplier_id (not a UUID)" });
        }
        return false;
      }
    }
    if (item.table_name === "stock_movements") {
      // Laravel backend requires stock_batch_id for stock_movements. Drop if null.
      if (!item.payload.stock_batch_id) {
        for (const id of idsFor(item.id)) {
          rejected.push({ id, reason: "Missing required stock_batch_id" });
        }
        return false;
      }
    }
    if (item.table_name === "stock_batches") {
      if (item.payload && "selling_price" in item.payload) {
        delete item.payload.selling_price;
      }
      // INSERT only — never widen this to UPDATE (client/AGENTS.md,
      // "Push details": it clobbers real batch_numbers server-side).
      if (item.operation === "INSERT" && !item.payload.batch_number) {
        item.payload.batch_number = "Opening Stock";
      }
    }
    return true;
  });
}
