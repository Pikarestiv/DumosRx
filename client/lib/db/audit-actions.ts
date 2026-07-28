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
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
