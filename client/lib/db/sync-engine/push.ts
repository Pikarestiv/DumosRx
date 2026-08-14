import { getPendingSyncItems, markSynced, recordSyncFailure } from "../local-database";
import { apiClient } from "@/lib/api/client";
import { PushResponse } from "./types";
import type { SyncChange } from "@/lib/types/sync";

const SYNC_BATCH_SIZE = 50;

// Matches ISO 8601 datetimes as produced by Date#toISOString(), e.g.
// "2026-07-25T03:35:07.593Z" — MySQL DATETIME columns reject the 'T'/'Z'
// and fractional seconds, so every such field (not just one hardcoded
// column name) needs to become "2026-07-25 03:35:07" before it's sent.
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

function normalizeDatetimeFields(payload: Record<string, unknown>) {
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (typeof value === "string" && ISO_DATETIME_REGEX.test(value)) {
      payload[key] = value.slice(0, 19).replace("T", " ");
    }
  }
}

/**
 * Push local changes to server
 */
export async function pushChanges(
  isManual: boolean = false,
  isSetup: boolean = false
): Promise<{ pushed: number }> {
  const pending = await getPendingSyncItems();

  if (pending.length === 0) return { pushed: 0 };

  // Categories are batched by created_at like everything else, so a product
  // whose category was (re)created after it chronologically can land in a
  // *later* request than the category referencing it — by which point the
  // category's server-side id-remap (from SyncController::push's duplicate-
  // name handling) no longer applies, since it only lives in that earlier
  // request's in-memory $idMap. Move every category change to the front of
  // the whole queue, not just within one batch, so categories are always
  // resolved (created or remapped) before anything in a later batch can
  // reference them.
  pending.sort((a, b) => (a.table_name === "categories" ? -1 : b.table_name === "categories" ? 1 : 0));

  // Process in batches
  let pushedCount = 0;

  for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
    const batch = pending.slice(i, i + SYNC_BATCH_SIZE);

    try {
      const rejected: { id: number; reason: string }[] = [];

      const mapped: SyncChange[] = batch.map((item) => {
        const payload = JSON.parse(item.payload);
        delete payload._deleted;
        // _version is intentionally kept — the server's conflict resolution
        // compares it against its own copy to decide whether this update is
        // stale (see SyncController::push). Stripping it here used to force
        // every conflict check onto the weaker updated_at-timestamp fallback,
        // which trusts each device's local clock instead of a monotonic
        // per-record counter.
        delete payload._synced;
        delete payload._synced_at;

        normalizeDatetimeFields(payload);

        return {
          ...item,
          payload,
        };
      });

      const changes = mapped.filter((item) => {
        if (item.table_name === "products") {
          // Any product row created/updated before the server dropped these
          // two columns (2026_07_23_182355_remove_brand_and_supplier_from_
          // products.php) still carries them in its queued payload snapshot,
          // since a snapshot taken at write time never picks up later schema
          // changes. Strip rather than reject — the row itself is otherwise
          // fine, only these two fields are stale.
          delete item.payload.brand_name;
          delete item.payload.supplier_id;

          const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          // Prevent bad payloads from blocking the entire sync queue
          if (
            item.payload.category_id &&
            !UUID_REGEX.test(item.payload.category_id as string)
          ) {
            rejected.push({ id: item.id, reason: "Invalid category_id (not a UUID)" });
            return false;
          }
          if (
            item.payload.supplier_id &&
            !UUID_REGEX.test(item.payload.supplier_id as string)
          ) {
            rejected.push({ id: item.id, reason: "Invalid supplier_id (not a UUID)" });
            return false;
          }
        }
        if (item.table_name === "stock_movements") {
          // Laravel backend requires stock_batch_id for stock_movements. Drop if null.
          if (!item.payload.stock_batch_id) {
            rejected.push({ id: item.id, reason: "Missing required stock_batch_id" });
            return false;
          }
        }
        if (item.table_name === "stock_batches") {
          if (item.payload && "selling_price" in item.payload) {
            delete item.payload.selling_price;
          }
        }
        return true;
      });

      // Filtered-out items are not silently dropped: record a backoff-tracked
      // failure so they're visible via last_error and eventually reported to
      // superadmins if the underlying data never gets fixed.
      for (const r of rejected) {
        await recordSyncFailure(r.id, r.reason);
      }

      if (changes.length === 0) {
        continue;
      }

      const response = (await apiClient.pushChanges(
        {
          changes,
        },
        isManual,
        isSetup
      )) as PushResponse;

      // The server isolates each change to its own savepoint (see
      // SyncController::push), so `response.success` reflects the batch
      // request succeeding, not every change within it — `response.failed`
      // lists which specific changes were rolled back individually. Only
      // mark the ones NOT in that list as synced; items filtered out above
      // (e.g. malformed payloads) were never sent and must NOT be marked
      // synced here either, or they'd be silently dropped from the queue.
      if (response.success) {
        const failedIds = new Set((response.failed ?? []).map((f) => f.id));
        const succeededIds = changes.map((c) => c.id).filter((id) => !failedIds.has(id));
        await markSynced(succeededIds);
        pushedCount += succeededIds.length;

        for (const f of response.failed ?? []) {
          if (f.id != null) {
            await recordSyncFailure(f.id, f.reason);
          }
        }
      }
    } catch (error) {
      // Don't abort the whole push run over one bad batch — record backoff
      // for this batch's items and continue with the remaining batches.
      console.error("Push sync failed for batch:", error);
      const message = error instanceof Error ? error.message : String(error);
      for (const item of batch) {
        await recordSyncFailure(item.id, message);
      }
    }
  }

  return { pushed: pushedCount };
}
