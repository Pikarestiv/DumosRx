import { apiClient } from "@/lib/api/client";
import type { buildStockFingerprint } from "./stock-fingerprint";
import type { buildTableFingerprint } from "./table-fingerprint";
import type { buildQueueStateReport } from "./queue-state";
import {
  applySyncCommands,
  readPendingCommandResults,
  clearCommandResults,
} from "./sync-commands";
import type { PushResponse } from "./types";
import type { SyncRun } from "./sync-run";
import { query } from "../core";

// A push with no changes, sent only to exchange command outcomes and reports.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-push-L215
export async function exchangeReportsOnly(
  stockFingerprint: Awaited<ReturnType<typeof buildStockFingerprint>>,
  tableFingerprint: Awaited<ReturnType<typeof buildTableFingerprint>>,
  queueState: Awaited<ReturnType<typeof buildQueueStateReport>>,
  isManual: boolean,
  isSetup: boolean,
  run: SyncRun,
): Promise<void> {
  const deliverableResults = await readPendingCommandResults();

  // Read directly rather than from queueState, which is null until a store is
  // active — a backed-off row must still be able to attract a command.
  const queuedRows = await query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM _sync_queue",
  );

  if (deliverableResults.length === 0 && Number(queuedRows[0]?.count ?? 0) === 0) {
    return;
  }

  try {
    const response = (await apiClient.pushChanges(
      {
        changes: [],
        stock_fingerprint: stockFingerprint,
        table_fingerprint: tableFingerprint,
        queue_state: queueState,
        sync_command_results: deliverableResults,
      },
      isManual,
      isSetup,
      run.id,
      run.storeId,
    )) as PushResponse;

    await clearCommandResults(deliverableResults.map((r) => r.id));

    if (response?.sync_commands?.length) {
      await applySyncCommands(response.sync_commands);
    }
  } catch (err) {
    console.warn("[Sync] Could not deliver command outcomes", err);
  }
}
