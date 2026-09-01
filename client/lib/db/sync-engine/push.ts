import { getPendingSyncItems, markSynced, recordSyncFailure } from "../local-database";
import { apiClient } from "@/lib/api/client";
import { PushResponse } from "./types";
import type { SyncChange } from "@/lib/types/sync";
import { remapForeignKey, DUPLICATE_NAME_TABLES } from "../reconcile-identity";
import { execute, transaction } from "../core";

const SYNC_BATCH_SIZE = 50;

// Matches ISO 8601 datetimes as produced by Date#toISOString(), e.g.
// "2026-07-25T03:35:07.593Z". MySQL DATETIME columns reject the 'T'/'Z'
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
): Promise<{ pushed: number; failedBatches: number }> {
  const pending = await getPendingSyncItems(isManual);

  if (pending.length === 0) return { pushed: 0, failedBatches: 0 };

  // Categories are batched by created_at like everything else, so a product
  // whose category was (re)created after it chronologically can land in a
  // *later* request than the category referencing it, by which point the
  // category's server-side id-remap (from SyncController::push's duplicate-
  // name handling) no longer applies, since it only lives in that earlier
  // request's in-memory $idMap. Move every category change to the front of
  // the whole queue, not just within one batch, so categories are always
  // resolved (created or remapped) before anything in a later batch can
  // reference them.
  pending.sort((a, b) => (a.table_name === "categories" ? -1 : b.table_name === "categories" ? 1 : 0));

  // Process in batches
  let pushedCount = 0;
  // Distinct from a normal server-reported per-item rejection (already
  // handled gracefully via response.failed/recordSyncFailure, and doesn't
  // affect this): a batch landing in the catch block below means something
  // unexpected happened (a network error, corrupted queue JSON, an
  // unrecognized response shape) before the server ever got to isolate
  // individual items. Tracked so the caller can tell "nothing pushed
  // because there was nothing to push" apart from "nothing pushed because
  // it kept failing" — see sync() in index.ts.
  let failedBatches = 0;

  for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
    // A manual sync (see the backoff-bypass fix) can retry a backlog spanning
    // many batches back-to-back; the API's shared rate limit is 60
    // requests/minute (see throttle:60,1 on this route in routes/api.php),
    // and other app traffic shares that same budget. Pausing between batches
    // (not before the first) keeps a large backlog from tripping "Too Many
    // Attempts" instead of actually syncing.
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    const batch = pending.slice(i, i + SYNC_BATCH_SIZE);

    try {
      const rejected: { id: number; reason: string }[] = [];

      const mapped: SyncChange[] = batch.map((item) => {
        const payload = JSON.parse(item.payload);
        delete payload._deleted;
        // _version is intentionally kept: the server's conflict resolution
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
          // changes. Strip rather than reject: the row itself is otherwise
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
          // Any batch created before product-import.ts stopped writing
          // batch_number: null still carries that literal null in its frozen
          // _sync_queue payload snapshot — a client code fix alone can't
          // rewrite data already queued. The server's batch_number column is
          // NOT NULL (unlike the local SQLite schema), so this keeps failing
          // forever on retry otherwise.
          if (!item.payload.batch_number) {
            item.payload.batch_number = "Opening Stock";
          }
        }
        return true;
      });

      // Filtered-out items are not silently dropped: record a backoff-tracked
      // failure so they're visible via last_error and eventually reported to
      // superadmins if the underlying data never gets fixed. Wrapped in a
      // single transaction so a large rejected batch defers the (expensive,
      // whole-database) sql.js saveDatabase() export to once here instead of
      // once per item — see transaction()'s own doc comment in core.ts. A
      // manual sync retrying thousands of backed-off items at once without
      // this batching can exhaust the tab's memory doing one full-database
      // re-serialization per item.
      if (rejected.length > 0) {
        await transaction(async () => {
          for (const r of rejected) {
            await recordSyncFailure(r.id, r.reason);
          }
        });
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
      // request succeeding, not every change within it: `response.failed`
      // lists which specific changes were rolled back individually. Only
      // mark the ones NOT in that list as synced; items filtered out above
      // (e.g. malformed payloads) were never sent and must NOT be marked
      // synced here either, or they'd be silently dropped from the queue.
      if (response.success) {
        const failedIds = new Set((response.failed ?? []).map((f) => f.id));
        const succeededIds = changes.map((c) => c.id).filter((id) => !failedIds.has(id));

        // Wrapped in a single transaction: a batch of up to SYNC_BATCH_SIZE
        // markSynced/recordSyncFailure/remapForeignKey calls each triggers
        // its own full-database sql.js export when run outside a
        // transaction (see the rejected-items comment above for why that
        // matters at scale).
        await transaction(async () => {
          await markSynced(succeededIds);
          pushedCount += succeededIds.length;

          for (const f of response.failed ?? []) {
            if (f.id != null) {
              await recordSyncFailure(f.id, f.reason);
            }
          }

          // The server silently skips an INSERT (and remaps the id) when a
          // category/supplier name collides with one it already has, but that
          // remap only lives in the memory of this one push request server-side
          // (see SyncController::push) — it's never reflected in this device's
          // local rows unless applied here. Left unhandled, any row in a LATER
          // batch that still references the old local id fails its foreign key
          // check forever, since a future delta pull only ever reconciles
          // categories/suppliers that appear in that pull's own response (see
          // DUPLICATE_NAME_TABLES in reconcile-identity.ts) — a long-unchanged,
          // already-existing row like this one never will.
          for (const [table, mapping] of Object.entries(response.id_map ?? {})) {
            const refs = DUPLICATE_NAME_TABLES[table];
            if (!refs) continue;
            for (const [oldId, newId] of Object.entries(mapping)) {
              if (oldId === newId) continue;
              await remapForeignKey(oldId, newId, refs);
              await execute(`UPDATE ${table} SET _deleted = 1 WHERE id = ?`, [oldId]);
            }
          }
        });
      }
    } catch (error) {
      // Don't abort the whole push run over one bad batch; record backoff
      // for this batch's items and continue with the remaining batches.
      console.error("Push sync failed for batch:", error);
      failedBatches++;
      const message = error instanceof Error ? error.message : String(error);
      await transaction(async () => {
        for (const item of batch) {
          await recordSyncFailure(item.id, message);
        }
      });
    }
  }

  return { pushed: pushedCount, failedBatches };
}
