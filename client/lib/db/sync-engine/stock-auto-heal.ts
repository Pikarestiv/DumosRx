import { query } from "../core";
import { logCrash } from "@/lib/utils/error-logger";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";
import {
  verifyStockIntegrity,
  foldStockQuantities,
  summarizeIntegrity,
  type StockIntegrityReport,
} from "./stock-integrity";

/**
 * Automatic repair of this device's own stock drift, run from the 24-hourly
 * sync health check. Rationale, refusals and failure modes:
 * docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md, "Phase 3".
 */

type HealSkipReason = "movement-log-incomplete" | "inspection-session";

/**
 * Whether this device holds the whole movement log up to a server timestamp:
 * a stamped window with no mid-window cursor left over. Mid-window, the log
 * is known-incomplete and a fold would mass-rewrite quantities the rest of
 * the window is about to correct anyway.
 */
export async function movementLogIsComplete(): Promise<boolean> {
  const rows = await query<{ last_synced_at: string | null; server_cursor: string | null }>(
    "SELECT last_synced_at, server_cursor FROM _sync_state WHERE table_name = 'stock_movements'",
  );
  return Boolean(rows[0]?.last_synced_at) && !rows[0]?.server_cursor;
}

async function skipReason(): Promise<HealSkipReason | null> {
  if (isTillInspectionSession()) return "inspection-session";
  if (!(await movementLogIsComplete())) return "movement-log-incomplete";
  return null;
}

function describe(
  before: StockIntegrityReport,
  folded: number,
  divergedAfter: number,
  skipped: HealSkipReason | null,
): string {
  if (skipped) {
    return (
      `Stock integrity: ${before.diverged} batch(es) disagree with their movement log` +
      ` (net ${before.netUnitDelta >= 0 ? "+" : ""}${before.netUnitDelta} units);` +
      ` auto-heal skipped (${skipped})`
    );
  }
  if (divergedAfter > 0) {
    return (
      `Stock auto-heal did not converge: ${divergedAfter} of ${before.diverged} batch(es)` +
      ` still disagree with their movement log after folding ${folded}`
    );
  }
  return (
    `Stock auto-heal corrected ${folded} batch(es) of ${before.checked}` +
    ` (net ${before.netUnitDelta >= 0 ? "+" : ""}${before.netUnitDelta} units),` +
    ` ${before.unreconstructable} refused as unreconstructable`
  );
}

/**
 * Verifies, repairs what the log can rebuild, re-verifies, and reports once.
 * Silent to the owner by design; the Sentry report and the audit row the fold
 * writes are the record. Swallows its own failures so it can never break the
 * row-count deficit path that follows it in the health check.
 */
export async function healStockIntegrity(): Promise<void> {
  try {
    const before = await verifyStockIntegrity();
    if (before.diverged === 0 && before.unreconstructable === 0) return;

    const skipped = before.diverged > 0 ? await skipReason() : null;
    const result =
      before.diverged > 0 && !skipped ? await foldStockQuantities("auto-heal") : null;
    const after = result && result.folded > 0 ? await verifyStockIntegrity() : before;

    await logCrash(
      new Error(describe(before, result?.folded ?? 0, result ? after.diverged : 0, skipped)),
      false,
      {
        area: "stock-autoheal",
        ...summarizeIntegrity(before),
        folded: result?.folded ?? 0,
        unitsCorrected: result?.unitsCorrected ?? 0,
        divergedAfter: result ? after.diverged : 0,
        ...(skipped ? { healSkipped: skipped } : {}),
        worstDiverged: JSON.stringify(
          [...before.divergedBatches]
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 10)
            .map((b) => ({ batchId: b.batchId, productId: b.productId, delta: b.delta })),
        ),
        refusedBatchIds: JSON.stringify(
          before.unreconstructableBatches.slice(0, 10).map((b) => b.batchId),
        ),
      },
    );
  } catch (error) {
    console.error("Stock auto-heal failed:", error);
  }
}
