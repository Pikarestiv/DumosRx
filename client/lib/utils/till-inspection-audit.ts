import { logAction } from "@/lib/db/core";
import { getTillInspectionSession } from "@/lib/utils/till-inspection";

export const TILL_REPAIR_ACTIONS = {
  fold: "ADMIN_TILL_FOLD_STOCK_QUANTITIES",
  clockOverride: "ADMIN_TILL_OVERRIDE_CLOCK_LOCKOUT",
} as const;

/**
 * Records a repair run from an inspection session against the ADMIN who ran
 * it. `logAction` attributes `user_id` to whoever the local DB still points at
 * — the staff user, or nobody — so without these details a repair reads as
 * the cashier's doing. Spec requires admin, device, store and outcome.
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
    await logAction(action, "admin_till_sessions", recordId, {
      ...outcome,
      admin_id: session?.admin.id ?? null,
      admin_email: session?.admin.email ?? null,
      session_id: session?.sessionId ?? null,
      device_id: session?.deviceId ?? null,
      store_id: session?.storeId ?? null,
    });
  } catch {
    /* audit is best-effort; the repair already happened */
  }
}
