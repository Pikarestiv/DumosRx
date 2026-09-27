/** Row shape returned by getProductHistory()'s auditLogs query: the raw
 * `audit_logs` table joined with the acting user's display name. */
export interface AuditLogRow {
  id: string;
  user_id?: string;
  action: string;
  table_name?: string;
  record_id?: string;
  details?: string | null;
  created_at?: string;
  user_name?: string;
  correlation_id?: string | null;
  /** How many times this exact (action, table, record_id) has repeated
   * since this row started - see logAction()'s dedup path in core.ts.
   * 1 (or undefined, on a row from before this column existed) for a
   * normal, non-repeating action. */
  occurrence_count?: number | null;
  last_occurred_at?: string | null;
}
