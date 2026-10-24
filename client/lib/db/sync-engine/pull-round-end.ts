import { execute, transaction } from "../core";
import { logCrash } from "@/lib/utils/error-logger";
import { rewindPullWindow } from "./pull-window";
import { summarizeSkippedRecords, type SkippedRecord } from "./pull-skip-report";
import {
  applyDeferredStockDeltas,
  countDeferredStockDeltas,
  type DeferredStockDelta,
} from "./deferred-stock-deltas";
import { PULL_PROGRESS } from "./pull-state";

export async function finishPullRound(
  windowStoreId: string,
  deferredMovementCursor: string | null,
  deferredMovementPageCursor: string | null,
  unresolvedDeltas: DeferredStockDelta[],
  skippedRecords: SkippedRecord[],
): Promise<void> {
  // Deltas and the cursor stamp commit as one unit: no window in between
  // for a crash to fall into.
  if (
    (await countDeferredStockDeltas()) > 0 ||
    deferredMovementCursor !== null ||
    deferredMovementPageCursor !== null
  ) {
    await transaction(async () => {
      unresolvedDeltas.push(...(await applyDeferredStockDeltas()));
      if (deferredMovementCursor !== null) {
        await execute(PULL_PROGRESS.completeWindow, [
          windowStoreId,
          "stock_movements",
          deferredMovementCursor,
        ]);
      } else if (deferredMovementPageCursor !== null) {
        await execute(PULL_PROGRESS.savePosition, [
          windowStoreId,
          "stock_movements",
          deferredMovementPageCursor,
        ]);
      }
    });
  }

  // A stranded batch is only re-sent if it is updated again, so a chronic
  // deferral needs the window reopened or it never resolves (A-176).
  if (unresolvedDeltas.length > 0) {
    await rewindPullWindow(windowStoreId, "stock_batches", "unresolved stock delta");
  }

  for (const d of unresolvedDeltas) {
    logCrash(
      new Error(
        `Pull deferred stock delta unresolved: movement ${d.movement_id} still has no stock_batches row ${d.stock_batch_id}`,
      ),
      false,
      {
        area: "sync-pull",
        table: "stock_movements",
        recordId: d.movement_id,
      },
    ).catch(() => {});
  }

  const skipSummary = summarizeSkippedRecords(skippedRecords);
  if (skipSummary) {
    logCrash(new Error(skipSummary.message), false, skipSummary.context).catch(() => {});
  }
}
