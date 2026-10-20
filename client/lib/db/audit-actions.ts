// Named audit-log action types, for the mutations where "INSERT"/"UPDATE" on a table name isn't specific enough to tell what actually happened…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-audit-actions-ts-L1
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

// Actions eligible for logAction()'s occurrence-count coalescing (see core.ts):
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-audit-actions-L23
export const DEDUPABLE_AUDIT_ACTIONS = new Set<string>([AUDIT_ACTIONS.LOGIN_FAILED]);

export function isDedupableAuditAction(action: string): boolean {
  return DEDUPABLE_AUDIT_ACTIONS.has(action);
}
