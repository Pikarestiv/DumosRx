import { getPendingSyncItems, markSynced, recordSyncFailure } from "../local-database";
import { apiClient } from "@/lib/api/client";
import { PushResponse } from "./types";
import type { SyncChange, SyncQueueItem } from "@/lib/types/sync";
import { remapForeignKey, DUPLICATE_NAME_TABLES } from "../reconcile-identity";
import { execute, query, transaction } from "../core";
import { toast } from "sonner";

// Reasons the server can report in `response.failed` that mean "this exact
// edit can never succeed by retrying" (see SyncController::push's strict
// version-equality check) rather than a transient failure worth backing off
// and retrying (network blip, momentary server error). Routing either of
// these through recordSyncFailure's exponential-backoff retry path would
// silently loop forever — the base version this edit was computed from
// doesn't change no matter how many times it's resent.
const NON_RETRYABLE_CONFLICT_REASONS = new Set(["version_conflict", "stale_timestamp"]);

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

// Best-effort, human-friendly singular label for the version-conflict toast.
// Not exhaustive — falls back to the raw table name for anything not listed,
// which is still an intelligible (if less polished) signal.
const RECORD_LABELS: Record<string, string> = {
  products: "a product",
  stock_batches: "a stock batch",
  customers: "a customer",
  sales: "a sale",
  categories: "a category",
  suppliers: "a supplier",
  expenses: "an expense",
  purchase_orders: "a purchase order",
  prescriptions: "a prescription",
  users: "a staff account",
  stores: "a store",
};

function describeSyncedRecord(tableName: string): string {
  return RECORD_LABELS[tableName] ?? `a ${tableName.replace(/_/g, " ")} record`;
}

/**
 * Coalesces multiple pending UPDATE entries for the SAME (table_name,
 * record_id) into one merged change before anything is sent to the server.
 *
 * Why this exists: update() (base-helpers.ts) no longer bumps `_version`
 * locally (see the fix for _known-bugs.md #11) — it now sends/stores the
 * row's unchanged base version, so the server can tell "this edit is based
 * on my current state" from "this edit is based on something stale."  That
 * fix is correct for the TWO-DEVICE case it targeted, but on its own it
 * introduces a single-device regression: `addToSyncQueue` appends one new
 * `_sync_queue` row per update() call with NO coalescing, so two ordinary
 * sequential edits to the same row before the next sync (e.g. a credit/
 * mixed-payment checkout's `update("customers", id, {outstanding_balance})`
 * immediately followed by `update("customers", id, {loyalty_points})` in
 * use-pos-payment.ts) queue two separate rows that both freeze the
 * IDENTICAL base `_version`. Pushed together (or even split across batches
 * for a large backlog), the first is accepted and the server bumps the
 * version — the second then collides against that bump and gets rejected
 * as a false "version_conflict," silently losing a completely ordinary,
 * non-conflicting local edit and showing a misleading "another device"
 * toast.
 *
 * The fix: fold every UPDATE queued for the same record into ONE change —
 * later field values win over earlier ones for the same column (the same
 * per-call "full overwrite of whatever fields it's given" semantics a
 * single update() already has), the merged payload carries the EARLIEST
 * entry's `_version` (the true base this whole local edit chain started
 * from — none of these rows has synced yet, so the server has no
 * knowledge of anything past that point), and every underlying queue row
 * id folded into the merge is tracked in `mergedIdsByRepId` so the caller
 * can mark them all synced (or all dropped, on a real conflict) together —
 * never just the representative row, which would silently orphan the rest.
 *
 * Runs once, up front, before the pending list is sliced into
 * SYNC_BATCH_SIZE batches, so batch-splitting can never separate two edits
 * to the same record into different requests and reintroduce this bug for
 * a large backlog.
 *
 * INSERT and DELETE entries are left untouched: INSERT never goes through
 * the version-conflict check at all (a fresh row has nothing to conflict
 * with yet), and a record is only ever soft/hard-deleted once while still
 * pending, so neither operation can produce the same-row queue pile-up
 * this function exists to fix.
 */
function coalescePendingUpdates(pending: SyncQueueItem[]): {
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

/**
 * Removes every currently-due UPDATE entry from `pending` whose record
 * (table_name + record_id) has ANY sibling UPDATE row still sitting in
 * `_sync_queue` under backoff (next_retry_at in the future) — see the call
 * site's doc comment for why letting a due row race ahead of a not-yet-due
 * sibling for the same record reintroduces a narrower version of the
 * coalescing bug. INSERT/DELETE entries are never held back — same
 * rationale as coalescePendingUpdates() not touching them.
 *
 * One query per distinct (table_name, record_id) key found among
 * `pending`'s UPDATE entries — acceptable here: this is a correctness-
 * critical path, not a hot loop, and matches this codebase's existing
 * precedent of per-record queries elsewhere in the sync path (e.g.
 * assertStoreOwnership in base-helpers.ts).
 */
async function withheldRecordsWithBackedOffSiblingsRemoved(
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

    // More rows exist for this record than are currently due: at least one
    // sibling UPDATE is still backed off. Hold back every due row for this
    // record too, rather than letting them push ahead alone this cycle.
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

/**
 * Push local changes to server
 */
export async function pushChanges(
  isManual: boolean = false,
  isSetup: boolean = false
): Promise<{ pushed: number; failedBatches: number }> {
  let pending = await getPendingSyncItems(isManual);

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

  // Retry-backoff can otherwise still split a same-record edit pair even
  // with coalescePendingUpdates() below: getPendingSyncItems() (unless
  // `isManual`, which bypasses backoff entirely) only returns rows that are
  // currently due, per next_retry_at. If edit A for a record failed
  // retryably earlier and is still backed off while edit B for the SAME
  // record is due, a background sync would only ever see B here — pushing
  // it alone, getting it accepted, and bumping the server version. When A
  // later comes due on its own (in some future sync), it now collides
  // against that bump with a stale base version: a false version_conflict
  // that silently drops A's fields, a narrower variant (needs a specific
  // retry-timing sequence, not just two ordinary sequential edits) of the
  // same bug coalescing already fixes for the "both due at once" case.
  // Guarded here rather than in coalescePendingUpdates() itself, since it
  // needs to see the FULL _sync_queue (including not-yet-due rows), not
  // just what getPendingSyncItems() already filtered down to. A manual sync
  // (isManual) already bypasses backoff and sees every row for a record
  // together in `pending`, so this is a no-op for that path.
  if (!isManual) {
    pending = await withheldRecordsWithBackedOffSiblingsRemoved(pending);
    if (pending.length === 0) return { pushed: 0, failedBatches: 0 };
  }

  // See coalescePendingUpdates()'s doc comment: folds multiple pending
  // UPDATEs for the same record into one merged change so they can't freeze
  // the same base _version in separate queue rows and falsely collide with
  // each other server-side. `mergedIdsByRepId` lets every id-keyed lookup
  // below (rejected/failed/succeeded/exception handling) act on every
  // underlying queue row a merged change represents, not just its
  // representative id.
  const { items: coalesced, mergedIdsByRepId } = coalescePendingUpdates(pending);
  const idsFor = (repId: number): number[] => mergedIdsByRepId.get(repId) ?? [repId];

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

  for (let i = 0; i < coalesced.length; i += SYNC_BATCH_SIZE) {
    // A manual sync (see the backoff-bypass fix) can retry a backlog spanning
    // many batches back-to-back; the API's shared rate limit is 60
    // requests/minute (see throttle:60,1 on this route in routes/api.php),
    // and other app traffic shares that same budget. Pausing between batches
    // (not before the first) keeps a large backlog from tripping "Too Many
    // Attempts" instead of actually syncing.
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    const batch = coalesced.slice(i, i + SYNC_BATCH_SIZE);

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
            for (const id of idsFor(item.id)) {
              rejected.push({ id, reason: "Invalid category_id (not a UUID)" });
            }
            return false;
          }
          if (
            item.payload.supplier_id &&
            !UUID_REGEX.test(item.payload.supplier_id as string)
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
          // Any batch INSERT created before product-import.ts stopped writing
          // batch_number: null still carries that literal null in its frozen
          // _sync_queue payload snapshot — a client code fix alone can't
          // rewrite data already queued. The server's batch_number column is
          // NOT NULL (unlike the local SQLite schema), so this keeps failing
          // forever on retry otherwise.
          //
          // Gated to INSERT specifically (not UPDATE) for two reasons found
          // in review: (1) a real quantity-only UPDATE payload — the normal
          // multi-terminal-sale shape from updateStockBatchQuantity() etc. in
          // lib/db/queries/inventory.ts — never includes batch_number at all,
          // so applying this unconditionally injected a bogus "Opening Stock"
          // into it, defeating SyncController::push's narrowed stock_batches
          // version-conflict exemption (which only fires when the payload is
          // provably quantity-only — a payload that's never actually empty
          // can never qualify) and reintroducing the false-conflict
          // regression that exemption exists to prevent. (2) worse, on an
          // ACCEPTED UPDATE this placeholder reaches the server's
          // `forceFill($payload)` and silently overwrites the batch's real,
          // already-correct batch_number in the database on every ordinary
          // sale/cost-correction/return-restock UPDATE. Neither problem is
          // possible for an INSERT: a legacy queued INSERT genuinely needs
          // *some* non-null value to satisfy the server's NOT NULL column,
          // and there's no pre-existing real batch_number on the server yet
          // for it to clobber.
          if (item.operation === "INSERT" && !item.payload.batch_number) {
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
        // reportImmediately=true: these are deterministic client-side
        // validation failures (bad UUID, missing required column) that will
        // fail identically on every retry, so waiting for the normal 5-retry
        // report threshold just delays remote visibility into a store that's
        // permanently stuck on this item for no operational reason.
        await transaction(async () => {
          for (const r of rejected) {
            await recordSyncFailure(r.id, r.reason, true);
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
        // Expanded so a merged change's representative id marks/deletes
        // EVERY underlying queue row it folded together, not just itself —
        // see coalescePendingUpdates()'s doc comment for why leaving any of
        // them behind would silently orphan a real, still-pending edit.
        const succeededIds = changes
          .map((c) => c.id)
          .filter((id) => !failedIds.has(id))
          .flatMap((id) => idsFor(id));

        // Collected inside the transaction below, reported (toast) after it
        // commits — same reason pull.ts defers its skippedRecords reporting:
        // a version conflict is known-permanent the moment the server says
        // so, not worth risking a nested write inside this batch's own
        // transaction just to surface it a few lines earlier. Coalescing
        // guarantees at most one `failed` entry per (table_name, record_id)
        // in the whole push run (every UPDATE for a given record was merged
        // into a single change before any batch was ever sent), so this
        // naturally produces exactly one toast per conflicted record, never
        // one per underlying queue row.
        const versionConflicts: { table_name: string; record_id: string }[] = [];

        // Wrapped in a single transaction: a batch of up to SYNC_BATCH_SIZE
        // markSynced/recordSyncFailure/remapForeignKey calls each triggers
        // its own full-database sql.js export when run outside a
        // transaction (see the rejected-items comment above for why that
        // matters at scale).
        await transaction(async () => {
          await markSynced(succeededIds);
          pushedCount += succeededIds.length;

          for (const f of response.failed ?? []) {
            if (f.id == null) continue;
            const underlyingIds = idsFor(f.id);

            if (NON_RETRYABLE_CONFLICT_REASONS.has(f.reason)) {
              // A version conflict can never be resolved by retrying — the
              // edit's base version is permanently stale no matter how many
              // times it's resent. Drop it (and every queue row merged into
              // it) from the queue outright instead of routing it through
              // recordSyncFailure's exponential-backoff retry path, which
              // would silently loop forever (well, until the backoff cap,
              // then a crash report — still not a real user-facing signal).
              // The next pull will naturally bring in the winning server
              // value now that nothing local is blocking it (see pull.ts's
              // pendingLocalEdit skip).
              const placeholders = underlyingIds.map(() => "?").join(", ");
              await execute(`DELETE FROM _sync_queue WHERE id IN (${placeholders})`, underlyingIds);
              versionConflicts.push({ table_name: f.table_name, record_id: f.record_id });
            } else {
              for (const id of underlyingIds) {
                await recordSyncFailure(id, f.reason);
              }
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

          // Apply the server-assigned authoritative version to accepted
          // UPDATEs right away, rather than waiting for a future pull to
          // bring it in: without this, this same device's very next local
          // edit (now that update() no longer increments _version locally)
          // would still be based on the pre-push version and get spuriously
          // rejected as a conflict against its own already-accepted change.
          //
          // `table` here comes straight from the server response, unlike the
          // id_map loop just above (which is guarded by
          // `DUPLICATE_NAME_TABLES[table]`) — the server is trusted, but an
          // unrecognized or locally-absent table name would still throw
          // (`no such table`) inside this transaction's callback, and an
          // uncaught throw here rolls back the ENTIRE batch's transaction,
          // including the markSynced() calls above — undoing otherwise-
          // successful work and setting up an infinite re-push loop for
          // every other item in the batch. Caught and warned per-row instead
          // of per-table so one bad table name can't take the rest down; the
          // affected record simply keeps its pre-push local _version until
          // the next pull corrects it (harmless — pull.ts always trusts the
          // server's version over whatever the local row has).
          for (const [table, mapping] of Object.entries(response.versions ?? {})) {
            for (const [recordId, newVersion] of Object.entries(mapping)) {
              try {
                await execute(`UPDATE ${table} SET _version = ? WHERE id = ?`, [newVersion, recordId]);
              } catch (err) {
                console.warn(
                  `[Sync] Failed to apply server-assigned _version to ${table}/${recordId}:`,
                  err,
                );
              }
            }
          }
        });

        // Loud, not silent — matching _known-bugs.md #10's post-restore
        // cloud-link notice, the closest existing precedent for "something
        // happened during sync that the user needs to know about, but
        // doesn't need a full merge UI to act on." One toast per conflicted
        // record: this is expected to be rare (the exact conflict shape
        // _known-bugs.md #11 was filed for), not a routine batch event.
        //
        // Deliberately does NOT claim "another device" as the cause: a
        // `stale_timestamp` rejection (the legacy fallback for a row with no
        // version tracking at all) isn't necessarily a second device — this
        // client can't actually verify who or what changed the record
        // server-side, only that its own edit no longer matches what it was
        // based on. State what happened, not an unverifiable cause.
        for (const conflict of versionConflicts) {
          toast.warning(
            `A change to ${describeSyncedRecord(conflict.table_name)} could not be saved because the record changed since this edit — the server's current version was kept.`,
          );
        }
      }
    } catch (error) {
      // Don't abort the whole push run over one bad batch; record backoff
      // for this batch's items and continue with the remaining batches.
      console.error("Push sync failed for batch:", error);
      failedBatches++;
      const message = error instanceof Error ? error.message : String(error);
      await transaction(async () => {
        for (const item of batch) {
          for (const id of idsFor(item.id)) {
            await recordSyncFailure(id, message);
          }
        }
      });
    }
  }

  return { pushed: pushedCount, failedBatches };
}
