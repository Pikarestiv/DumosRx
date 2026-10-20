import { logAction } from "@/lib/db/core";
import { getTillInspectionSession } from "@/lib/utils/till-inspection";

export const TILL_REPAIR_ACTIONS = {
  fold: "ADMIN_TILL_FOLD_STOCK_QUANTITIES",
  clockOverride: "ADMIN_TILL_OVERRIDE_CLOCK_LOCKOUT",
  autoHeal: "AUTO_HEAL_STOCK_QUANTITIES",
} as const;

// Records a repair run from an inspection session against the ADMIN who ran it, both as the row's actor and in its details.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-till-inspection-audit-L10
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
      // The admin, so the pushed row names them rather than the sync token's owner.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-till-inspection-audit-ts-L34
      session?.admin.id,
    );
  } catch {
    /* audit is best-effort; the repair already happened */
  }
}
