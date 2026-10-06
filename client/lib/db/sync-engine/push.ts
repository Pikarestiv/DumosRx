import {
  getPendingSyncItems,
  markConflictSettled,
  markSynced,
  recordSyncFailure,
} from "../local-database";
import { apiClient } from "@/lib/api/client";
import { PushResponse } from "./types";
import type { SyncChange, SyncQueueItem } from "@/lib/types/sync";
import { remapForeignKey, DUPLICATE_NAME_TABLES } from "../reconcile-identity";
import {
  conflictFieldList,
  recordTerminalConflict,
  resolveConflictsForRecords,
} from "./conflict-log";
import { execute, query, transaction } from "../core";
import { isExpectedSyncRestriction } from "@/lib/utils/error-logger";
import { toast } from "sonner";

// Terminal: the queued payload is frozen, so resending can never change the
// outcome. See client/AGENTS.md, "Push details (sync-engine/push.ts)".
const NON_RETRYABLE_CONFLICT_REASONS = new Set([
  "version_conflict",
  "stale_timestamp",
  "quantity_received_exceeds_ordered",
  "permission_denied",
]);

// Dropped without a toast: queued by automatic machinery, not a user action.
const SILENT_TERMINAL_REASONS = new Set(["permission_denied"]);

// Server row doesn't carry the pushed id, so no pull can ever settle it.
// See docs/FIXED_BUGS.md "audit_logs conflict resurrection loop".
const TERMINAL_CONFLICT_SETTLES_SOURCE_ROW = new Set(["audit_logs"]);

// The caller has no access to this row's store, so it is unreachable by pull
// too and no pull can ever settle it, whatever table it is on. See
// docs/FIXED_BUGS.md A-161.
const REASONS_SETTLING_SOURCE_ROW = new Set(["permission_denied"]);

const SYNC_BATCH_SIZE = 50;

/** Sorts categories to the front of the queue, leaving every other row's
 * relative order untouched. Must stay a *consistent* comparator — see
 * client/AGENTS.md, "Push details (sync-engine/push.ts)". */
export function compareCategoriesFirst(
  a: { table_name: string },
  b: { table_name: string },
): number {
  return Number(b.table_name === "categories") - Number(a.table_name === "categories");
}

// MySQL DATETIME rejects the 'T'/'Z' and fractional seconds, so every
// ISO-shaped string field is rewritten before it's sent.
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

function normalizeDatetimeFields(payload: Record<string, unknown>) {
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (typeof value === "string" && ISO_DATETIME_REGEX.test(value)) {
      payload[key] = value.slice(0, 19).replace("T", " ");
    }
  }
}

// Best-effort singular labels for the version-conflict toast; anything not
// listed falls back to the raw table name.
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
 * Folds every pending UPDATE for the same (table_name, record_id) into one
 * merged change: later fields win, the merged payload keeps the EARLIEST
 * entry's `_version`, and `mergedIdsByRepId` maps the representative queue
 * row id to every row folded into it so callers settle them all together.
 * INSERT/DELETE are untouched. Why this is required, and why it must run
 * before batch slicing: client/AGENTS.md, "Push details".
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
 * Removes every currently-due UPDATE from `pending` whose record has ANY
 * sibling UPDATE still backed off in `_sync_queue`; INSERT/DELETE are never
 * held back. One query per distinct record — a correctness-critical path,
 * not a hot loop. Rationale: client/AGENTS.md, "Push details".
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

/**
 * Push local changes to server
 */
export async function pushChanges(
  isManual: boolean = false,
  isSetup: boolean = false,
  // Marks every batch as one sync run; the server throttles per run.
  runId?: string,
): Promise<{ pushed: number; failedBatches: number }> {
  let pending = await getPendingSyncItems(isManual);

  if (pending.length === 0) return { pushed: 0, failedBatches: 0 };

  // Categories must resolve before any later batch can reference them: the
  // server's id-remap only lives in that one request's in-memory $idMap.
  pending.sort(compareCategoriesFirst);

  // Backoff can otherwise split a same-record edit pair that coalescing
  // would have merged; no-op for a manual sync, which bypasses backoff.
  if (!isManual) {
    pending = await withheldRecordsWithBackedOffSiblingsRemoved(pending);
    if (pending.length === 0) return { pushed: 0, failedBatches: 0 };
  }

  // idsFor() expands a merged change back to every queue row it represents;
  // every id-keyed branch below must use it, never the representative id.
  const { items: coalesced, mergedIdsByRepId } = coalescePendingUpdates(pending);
  const idsFor = (repId: number): number[] => mergedIdsByRepId.get(repId) ?? [repId];

  // Process in batches
  let pushedCount = 0;
  // Counts whole-batch failures only (not per-item rejections), so sync()
  // can tell "nothing to push" from "everything failed".
  let failedBatches = 0;

  for (let i = 0; i < coalesced.length; i += SYNC_BATCH_SIZE) {
    // The route's shared limit is 60 req/min; pace multi-batch backlogs.
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    const batch = coalesced.slice(i, i + SYNC_BATCH_SIZE);

    // Ids already given a specific rejection reason below; the whole-batch
    // and catch paths skip them rather than overwrite it.
    const alreadyRejectedIds = new Set<number>();

    try {
      const rejected: { id: number; reason: string }[] = [];

      const mapped: SyncChange[] = await Promise.all(
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

      const changes = mapped.filter((item) => {
        if (item.table_name === "products") {
          // Stale columns still present in payloads queued before the server
          // dropped them; strip rather than reject the whole row.
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
          // INSERT only — never widen this to UPDATE (client/AGENTS.md,
          // "Push details": it clobbers real batch_numbers server-side).
          if (item.operation === "INSERT" && !item.payload.batch_number) {
            item.payload.batch_number = "Opening Stock";
          }
        }
        return true;
      });

      // Filtered-out items are never silently dropped; one transaction so
      // sql.js exports the database once, not once per item.
      if (rejected.length > 0) {
        // reportImmediately: deterministic validation failures that will
        // fail identically forever, so don't wait for the retry threshold.
        await transaction(async () => {
          for (const r of rejected) {
            await recordSyncFailure(r.id, r.reason, true);
          }
        });
        // Only after the transaction commits: a rollback must not leave an
        // unrecorded failure looking recorded.
        for (const r of rejected) {
          alreadyRejectedIds.add(r.id);
        }
      }

      if (changes.length === 0) {
        continue;
      }

      const response = (await apiClient.pushChanges(
        {
          changes,
        },
        isManual,
        isSetup,
        runId,
      )) as PushResponse;

      // The server savepoints each change, so `success` means the request
      // succeeded; `failed` lists the changes rolled back individually.
      if (response.success) {
        const failedIds = new Set((response.failed ?? []).map((f) => f.id));
        const succeededChanges = changes.filter((c) => !failedIds.has(c.id));
        const succeededIds = succeededChanges
          .map((c) => c.id)
          .flatMap((id) => idsFor(id));

        // Collected in the transaction below, toasted after it commits.
        const versionConflicts: { table_name: string; record_id: string; reason: string }[] = [];

        // retry_count > 0 means this conflict is most likely the item's own
        // already-applied first attempt — logged, not toasted.
        const silencedConflicts: { table_name: string; record_id: string }[] = [];

        // One transaction per batch: each bookkeeping call outside one
        // triggers its own full-database sql.js export.
        await transaction(async () => {
          const succeededRecords = succeededChanges.map((c) => ({
            table_name: c.table_name,
            record_id: c.record_id,
          }));
          await markSynced(succeededIds, succeededRecords);
          // A later change to the same record landing means whatever an
          // earlier dropped one carried has been superseded (conflict-log.ts).
          await resolveConflictsForRecords(succeededRecords);
          pushedCount += succeededIds.length;

          for (const f of response.failed ?? []) {
            if (f.id == null) continue;
            const underlyingIds = idsFor(f.id);

            if (NON_RETRYABLE_CONFLICT_REASONS.has(f.reason)) {
              // Terminal: drop every merged queue row rather than retrying;
              // the next pull brings the server's winning value down.
              const placeholders = underlyingIds.map(() => "?").join(", ");
              const priorAttempts = await query<{ retry_count: number | null }>(
                `SELECT retry_count FROM _sync_queue WHERE id IN (${placeholders})`,
                underlyingIds,
              );
              const wasRetried = priorAttempts.some((row) => (row.retry_count ?? 0) > 0);

              await execute(`DELETE FROM _sync_queue WHERE id IN (${placeholders})`, underlyingIds);

              if (
                TERMINAL_CONFLICT_SETTLES_SOURCE_ROW.has(f.table_name) ||
                REASONS_SETTLING_SOURCE_ROW.has(f.reason)
              ) {
                await markConflictSettled(f.table_name, f.record_id);
              }

              // Durable trace of what this drop lost, for surfaces that must
              // outlive the toast below (A-26 — see conflict-log.ts).
              await recordTerminalConflict({
                table_name: f.table_name,
                record_id: f.record_id,
                reason: f.reason,
                fields: conflictFieldList(
                  changes.find((c) => c.id === f.id)?.payload as
                    | Record<string, unknown>
                    | undefined,
                ),
              });

              if (wasRetried) {
                silencedConflicts.push({ table_name: f.table_name, record_id: f.record_id });
              } else {
                versionConflicts.push({ table_name: f.table_name, record_id: f.record_id, reason: f.reason });
              }
            } else {
              for (const id of underlyingIds) {
                await recordSyncFailure(id, f.reason);
              }
            }
          }

          // The duplicate-name id remap must be applied locally here; no
          // future pull will do it (client/AGENTS.md, "Push details").
          for (const [table, mapping] of Object.entries(response.id_map ?? {})) {
            const refs = DUPLICATE_NAME_TABLES[table];
            if (!refs) continue;
            for (const [oldId, newId] of Object.entries(mapping)) {
              if (oldId === newId) continue;
              await remapForeignKey(oldId, newId, refs);
              await execute(`UPDATE ${table} SET _deleted = 1 WHERE id = ?`, [oldId]);
              // remapForeignKey() rewrites payload content only, never the
              // queue row's own record_id, which the server looks up by.
              await execute(
                `UPDATE _sync_queue SET record_id = ? WHERE table_name = ? AND record_id = ?`,
                [newId, table, oldId],
              );
            }
          }

          // Caught per row: an unrecognized `table` throwing here would roll
          // back the whole batch, markSynced() included.
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

        // Wording deliberately never blames "another device" — see
        // client/AGENTS.md, "Push details".
        const toastableConflicts = versionConflicts.filter((conflict) => {
          if (SILENT_TERMINAL_REASONS.has(conflict.reason)) {
            console.info(
              `[Sync] ${conflict.table_name} record ${conflict.record_id} was rejected as ${conflict.reason}; queue row dropped, the next pull brings the server's version down. No toast shown.`,
            );
            return false;
          }
          // Push-only telemetry the user never edits: log, don't toast.
          if (conflict.table_name === "feedback" || conflict.table_name === "audit_logs") {
            console.info(
              `[Sync] ${conflict.table_name} record ${conflict.record_id} hit a version conflict; server's version kept, no toast shown.`,
            );
            return false;
          }
          return true;
        });
        // Sonner flushSyncs per toast(); a batch's worth in one tick trips
        // React's "Maximum update depth exceeded" and crashes the page.
        const CONFLICT_TOAST_THRESHOLD = 5;
        if (toastableConflicts.length > CONFLICT_TOAST_THRESHOLD) {
          toast.warning(
            `${toastableConflicts.length} changes could not be saved because the records changed since those edits. The server's current versions were kept.`,
          );
        } else {
          for (const conflict of toastableConflicts) {
            toast.warning(
              `A change to ${describeSyncedRecord(conflict.table_name)} could not be saved because the record changed since this edit. The server's current version was kept.`,
            );
          }
        }
        for (const conflict of silencedConflicts) {
          console.info(
            `[Sync] Retried edit to ${conflict.table_name}/${conflict.record_id} hit a version conflict, likely its own earlier attempt already applied; server's version kept, no toast shown.`,
          );
        }
      } else {
        // Whole-batch rejection (request completed, server refused it):
        // keyed off `batch`, not `changes`, same as the catch block.
        failedBatches++;
        const message = response.message || "Sync batch rejected by server";
        await transaction(async () => {
          for (const item of batch) {
            for (const id of idsFor(item.id)) {
              if (alreadyRejectedIds.has(id)) continue;
              await recordSyncFailure(id, message);
            }
          }
        });
      }
    } catch (error) {
      // A plan restriction stops the run with the queue untouched; backing
      // off per item would report a healthy queue as stuck.
      if (isExpectedSyncRestriction(error)) {
        console.warn("[Sync] Push stopped by a plan restriction:", error);
        throw error;
      }
      // Don't abort the whole push run over one bad batch; record backoff
      // for this batch's items and continue with the remaining batches.
      console.error("Push sync failed for batch:", error);
      failedBatches++;
      const message = error instanceof Error ? error.message : String(error);
      await transaction(async () => {
        for (const item of batch) {
          for (const id of idsFor(item.id)) {
            if (alreadyRejectedIds.has(id)) continue;
            await recordSyncFailure(id, message);
          }
        }
      });
    }
  }

  return { pushed: pushedCount, failedBatches };
}
