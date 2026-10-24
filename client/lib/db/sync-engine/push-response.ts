import { markConflictSettled, recordSyncFailure } from "../local-database";
import type { SyncChange } from "@/lib/types/sync";
import { remapForeignKey, DUPLICATE_NAME_TABLES, columnExists } from "../reconcile-identity";
import { conflictFieldList, recordTerminalConflict } from "./conflict-log";
import { execute, query } from "../core";
import { rewindPullWindow, TABLES_NEVER_PULLED } from "./pull-window";
import type { PushConflict } from "./push-conflict-toasts";
import type { PushResponse } from "./types";

// Terminal: the queued payload is frozen, so resending can never change the
// outcome. See client/AGENTS.md, "Push details (sync-engine/push.ts)".
const NON_RETRYABLE_CONFLICT_REASONS = new Set([
  "version_conflict",
  "stale_timestamp",
  "quantity_received_exceeds_ordered",
  "permission_denied",
]);

// No pull can ever settle these, so left unsynced they are requeued and re-refused for ever.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-push-ts-L43
const TERMINAL_CONFLICT_SETTLES_SOURCE_ROW = new Set(["audit_logs", "feedback"]);

// Unreachable by any future pull, whatever table it's on - see A-161.
// Deliberately excludes `forbidden`; see docs/KNOWN_BUGS.md A-165.
const REASONS_SETTLING_SOURCE_ROW = new Set(["permission_denied"]);

// Reasons where the server kept a row this device now disagrees with, so the device has to be made to re-pull it.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-push-ts-L55
const REASONS_NEEDING_REPULL = new Set(["version_conflict", "stale_timestamp"]);

export async function settleFailedChanges(
  failed: NonNullable<PushResponse["failed"]>,
  changes: SyncChange[],
  idsFor: (repId: number) => number[],
  storeId: string | null,
  versionConflicts: PushConflict[],
  silencedConflicts: { table_name: string; record_id: string }[],
): Promise<void> {
  const rewoundTables = new Set<string>();

  for (const f of failed) {
    if (f.id == null) continue;
    const underlyingIds = idsFor(f.id);

    if (NON_RETRYABLE_CONFLICT_REASONS.has(f.reason)) {
      // Terminal: drop every merged queue row rather than retrying.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-push-ts-L491
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

      if (
        REASONS_NEEDING_REPULL.has(f.reason) &&
        !TABLES_NEVER_PULLED.has(f.table_name) &&
        !rewoundTables.has(f.table_name)
      ) {
        rewoundTables.add(f.table_name);
        await rewindPullWindow(storeId ?? "", f.table_name, f.reason);
      }

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
}

export async function applyDuplicateNameIdMap(idMap: NonNullable<PushResponse["id_map"]>): Promise<void> {
  for (const [table, mapping] of Object.entries(idMap)) {
    if (!Object.hasOwn(DUPLICATE_NAME_TABLES, table)) continue;
    const refs = DUPLICATE_NAME_TABLES[table];
    if (!refs) continue;
    const tableHasStoreId = await columnExists(table, "store_id");
    for (const [oldId, newId] of Object.entries(mapping)) {
      if (oldId === newId) continue;
      // A real read error must roll the batch back like its
      // neighbours, so the absent column is guarded, never caught.
      const losing = tableHasStoreId
        ? await query<{ store_id: string | null }>(
            `SELECT store_id FROM ${table} WHERE id = ?`,
            [oldId],
          )
        : [];
      await remapForeignKey(oldId, newId, refs, losing[0]?.store_id ?? null);
      await execute(`UPDATE ${table} SET _deleted = 1 WHERE id = ?`, [oldId]);
      // remapForeignKey() rewrites payload content only, never the
      // queue row's own record_id, which the server looks up by.
      await execute(
        `UPDATE _sync_queue SET record_id = ? WHERE table_name = ? AND record_id = ?`,
        [newId, table, oldId],
      );
    }
  }
}

export async function applyServerVersions(versions: NonNullable<PushResponse["versions"]>): Promise<void> {
  // Caught per row: an unrecognized `table` throwing here would roll
  // back the whole batch, markSynced() included.
  for (const [table, mapping] of Object.entries(versions)) {
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
}
