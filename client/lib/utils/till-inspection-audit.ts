import { logAction } from "@/lib/db/core";
import { getTillInspectionSession } from "@/lib/utils/till-inspection";

export const TILL_REPAIR_ACTIONS = {
  fold: "ADMIN_TILL_FOLD_STOCK_QUANTITIES",
  clockOverride: "ADMIN_TILL_OVERRIDE_CLOCK_LOCKOUT",
  autoHeal: "AUTO_HEAL_STOCK_QUANTITIES",
} as const;

/**
 * Records a repair run from an inspection session against the ADMIN who ran
 * it, both as the row's actor and in its details. Two separate traps:
 * `logAction` defaults `user_id` to whoever the local DB points at (the staff
 * user, or nobody), and `SyncController` then backfills an empty or unknown id
 * from the sync token's owner — so the SERVER's record would name the store
 * owner. The admin's real id is known to the server, so passing it survives
 * the push intact. Spec requires admin, device, store and outcome.
 *
 * Never throws: an audit failure must not undo a completed repair.
 */
export async function logTillRepair(
  action: (typeof TILL_REPAIR_ACTIONS)[keyof typeof TILL_REPAIR_ACTIONS],
  recordId: string,
  outcome: Record<string, unknown>,
): Promise<void> {
  const session = getTillInspectionSession();

  try {
    await logAction(
      action,
      "admin_till_sessions",
      recordId,
      {
        ...outcome,
        admin_id: session?.admin.id ?? null,
        admin_email: session?.admin.email ?? null,
        session_id: session?.sessionId ?? null,
        device_id: session?.deviceId ?? null,
        store_id: session?.storeId ?? null,
      },
      undefined,
      undefined,
      // The admin, so the pushed row names them rather than the sync token's
      // owner. Without it the server's log said the STORE OWNER ran the clock
      // override — backwards for the one repair whose premise is that the
      // owner is the suspected tamperer.
      session?.admin.id,
    );
  } catch {
    /* audit is best-effort; the repair already happened */
  }
}
