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

      // Records with real, pre-existing legacy data problems (not caused by
      // tonight's multi-store/identity fix) that would otherwise permanently
      // block every other queued change sharing a batch with them, since
      // push runs a whole batch as one all-or-nothing transaction server-
      // side. Each has a root cause that needs its own dedicated fix later:
      //  - 5c5d33b4 (product "Panadol Extra"): category_id points at a
      //    local category whose server-side insert was silently skipped as
      //    a duplicate name — the id-remap from that skip only applies
      //    within the same push request, so a retry in a later request can
      //    never resolve it.
      //  - a0f26026 (product "Emzor Vitamin C") and 7545bc6a (supplier
      //    "Kingsize Pharmaceuticals"): both insert cleanly on their own
      //    (no error ever logged for either one's own INSERT) but never
      //    actually persist, because something else sharing their batch
      //    keeps failing and rolling back the whole transaction — needs
      //    proper batch-partitioning (isolate a bad row to its own retry
      //    instead of taking its whole batch down) to fix generally.
      // Rejecting them here (their own row, and anything elsewhere in this
      // payload referencing their id) is a stopgap, not a real fix.
      const KNOWN_BAD_IDS = new Set([
        "5c5d33b4-13e0-4826-a69b-7745fa5ffed6",
        "a0f26026-b19f-40ec-972d-533d3554e30e",
        "7545bc6a-edd3-4e57-8bcf-24268b4b4758",
      ]);

      const changes = mapped.filter((item) => {
        if (
          Object.values(item.payload).some(
            (v) => typeof v === "string" && KNOWN_BAD_IDS.has(v),
          )
        ) {
          rejected.push({ id: item.id, reason: "References a known-bad legacy record" });
          return false;
        }

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
        if (
          item.table_name === "purchase_order_items" ||
          item.table_name === "stock_batches" ||
          item.table_name === "stock_movements" ||
          item.table_name === "sale_items"
        ) {
          // Hotfix for bad product_id that was dropped from sync queue earlier
          if (
            item.payload.product_id === "5c5d33b4-13e0-4826-a69b-7745fa5ffed6"
          ) {
            rejected.push({ id: item.id, reason: "Known-bad product_id" });
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

      // If successful, mark as synced. Only the items actually included in
      // `changes` were sent — items filtered out above (e.g. malformed
      // payloads) must NOT be marked synced here, or they'd be silently
      // dropped from the queue without ever reaching the server.
      if (response.success) {
        const ids = changes.map((c) => c.id);
        await markSynced(ids);
        pushedCount += ids.length;
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
