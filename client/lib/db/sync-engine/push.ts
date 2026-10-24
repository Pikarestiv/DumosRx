import {
  getPendingSyncItems,
  markSynced,
  recordSyncFailure,
} from "../local-database";
import { attributeStorelessProductsFromEvidence } from "./legacy-product-attribution";
import { apiClient } from "@/lib/api/client";
import { buildStockFingerprint } from "./stock-fingerprint";
import { buildTableFingerprint } from "./table-fingerprint";
import { buildQueueStateReport } from "./queue-state";
import {
  applySyncCommands,
  readPendingCommandResults,
  clearCommandResults,
} from "./sync-commands";
import {
  coalescePendingUpdates,
  compareCategoriesFirst,
  withheldRecordsWithBackedOffSiblingsRemoved,
} from "./push-queue-prep";
import { exchangeReportsOnly } from "./push-reports-only";
import { announceTerminalConflicts, type PushConflict } from "./push-conflict-toasts";
import { filterPushableChanges, mapBatchPayloads, type PushRejection } from "./push-request";
import { applyDuplicateNameIdMap, applyServerVersions, settleFailedChanges } from "./push-response";
import { PushResponse } from "./types";
import type { SyncChange } from "@/lib/types/sync";
import { resolveSyncRun, type SyncRun } from "./sync-run";
import { resolveConflictsForRecords } from "./conflict-log";
import { transaction } from "../core";
import { isExpectedSyncNoise } from "@/lib/utils/error-logger";

const SYNC_BATCH_SIZE = 50;

export { compareCategoriesFirst };

export async function pushChanges(
  isManual: boolean = false,
  isSetup: boolean = false,
  // Marks every batch as one sync run; the server throttles per run, and the
  // run's store labels every request and report it produces (A-304).
  run?: SyncRun,
): Promise<{ pushed: number; failedBatches: number }> {
  const activeRun = resolveSyncRun(run);
  // Before the fingerprints, so they describe what this push sends; best effort, never blocks a push.
  await attributeStorelessProductsFromEvidence().catch((err) => console.warn("[Sync] Legacy product attribution skipped", err));
  // Computed once per run, not per batch: neither value needs batch
  // granularity and both scan the whole queue / batch table.
  const stockFingerprint = await buildStockFingerprint(activeRun.storeId);
  const tableFingerprint = await buildTableFingerprint(activeRun.storeId);
  const queueState = await buildQueueStateReport(activeRun.storeId);
  let pending = await getPendingSyncItems(isManual);

  if (pending.length === 0) {
    await exchangeReportsOnly(
      stockFingerprint,
      tableFingerprint,
      queueState,
      isManual,
      isSetup,
      activeRun,
    );

    return { pushed: 0, failedBatches: 0 };
  }

  // Categories must resolve before any later batch can reference them: the
  // server's id-remap only lives in that one request's in-memory $idMap.
  pending.sort(compareCategoriesFirst);

  // Backoff can otherwise split a same-record edit pair that coalescing
  // would have merged; no-op for a manual sync, which bypasses backoff.
  if (!isManual) {
    pending = await withheldRecordsWithBackedOffSiblingsRemoved(pending);
    if (pending.length === 0) {
      await exchangeReportsOnly(
        stockFingerprint,
        tableFingerprint,
        queueState,
        isManual,
        isSetup,
        activeRun,
      );

      return { pushed: 0, failedBatches: 0 };
    }
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
    // 60 req/min per authenticated USER (laravel-server/routes/api.php:132),
    // so tills on one shared login share it; pace multi-batch backlogs.
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    const batch = coalesced.slice(i, i + SYNC_BATCH_SIZE);

    // Ids already given a specific rejection reason below; the whole-batch
    // and catch paths skip them rather than overwrite it.
    const alreadyRejectedIds = new Set<number>();

    try {
      const rejected: PushRejection[] = [];

      const mapped: SyncChange[] = await mapBatchPayloads(batch);

      const changes = filterPushableChanges(mapped, idsFor, rejected);

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

      // Read, not consumed: cleared only once the server has acknowledged
      // them, so a failed request cannot lose an outcome.
      const deliverableResults = await readPendingCommandResults();

      const response = (await apiClient.pushChanges(
        {
          changes,
          stock_fingerprint: stockFingerprint,
          table_fingerprint: tableFingerprint,
          queue_state: queueState,
          sync_command_results: deliverableResults,
        },
        isManual,
        isSetup,
        activeRun.id,
        activeRun.storeId,
      )) as PushResponse;

      // The server has them now, so they can stop being re-sent.
      if (deliverableResults.length > 0) {
        await clearCommandResults(deliverableResults.map((r) => r.id));
      }

      // The server savepoints each change, so `success` means the request
      // succeeded; `failed` lists the changes rolled back individually.
      if (response.success) {
        const failedIds = new Set((response.failed ?? []).map((f) => f.id));
        const succeededChanges = changes.filter((c) => !failedIds.has(c.id));
        const succeededIds = succeededChanges
          .map((c) => c.id)
          .flatMap((id) => idsFor(id));

        // Collected in the transaction below, toasted after it commits.
        const versionConflicts: PushConflict[] = [];

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

          await settleFailedChanges(
            response.failed ?? [],
            changes,
            idsFor,
            activeRun.storeId,
            versionConflicts,
            silencedConflicts,
          );

          // The duplicate-name id remap must be applied locally here; no
          // future pull will do it (client/AGENTS.md, "Push details").
          await applyDuplicateNameIdMap(response.id_map ?? {});

          await applyServerVersions(response.versions ?? {});
        });

        // After this batch's bookkeeping, never before:
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-push-ts-L588
        if (response.sync_commands?.length) {
          try {
            await applySyncCommands(response.sync_commands);
          } catch (err) {
            console.warn("[Sync] Failed to apply operator commands", err);
          }
        }

        announceTerminalConflicts(versionConflicts, silencedConflicts);
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
      if (isExpectedSyncNoise(error)) {
        console.warn("[Sync] Push stopped by an expected condition:", error);
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
