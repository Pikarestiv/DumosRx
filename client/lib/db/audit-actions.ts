/**
 * Named audit-log action types, for the mutations where "INSERT"/"UPDATE" on
 * a table name isn't specific enough to tell what actually happened without
 * parsing the details blob. Pass one of these to insert()/update()/remove()'s
 * `options.action` to override the generic default.
 */
export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  LOGIN_FAILED: "LOGIN_FAILED",
  PIN_CHANGED: "PIN_CHANGED",
  SALE_RETURN: "SALE_RETURN",
  STOCK_ADJUSTMENT: "STOCK_ADJUSTMENT",
  STOCK_EXPIRED: "STOCK_EXPIRED",
  STOCK_DAMAGED: "STOCK_DAMAGED",
  RECEIVE_PO: "RECEIVE_PO",
  RESELLER_COMMISSION_REDEEMED: "RESELLER_COMMISSION_REDEEMED",
  FACTORY_RESET: "FACTORY_RESET",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Actions eligible for logAction()'s occurrence-count coalescing (see
 * core.ts): a REPEATED, machine-generated event for the same (action,
 * table, record_id) - a bug/failure that keeps re-firing - collapses into
 * one row with a growing `occurrence_count` instead of a fresh audit_logs
 * row (and a fresh sync-queue INSERT) every single time. Deliberately NOT
 * applied to every action: a genuine user action (a sale, a PIN change, a
 * stock adjustment) must stay one row per real-world occurrence, since
 * that's exactly what the Activity Log exists to show.
 *
 * LOGIN_FAILED is the one case already in this codebase that fires
 * unboundedly for the same identifier (repeated PIN mistakes, or a
 * brute-force attempt) - the shape this was written for. Add a new action
 * here only if it's genuinely the same kind of "the same failure keeps
 * re-happening," not a real distinct event that happens to repeat.
 */
export const DEDUPABLE_AUDIT_ACTIONS = new Set<string>([AUDIT_ACTIONS.LOGIN_FAILED]);

export function isDedupableAuditAction(action: string): boolean {
  return DEDUPABLE_AUDIT_ACTIONS.has(action);
}
