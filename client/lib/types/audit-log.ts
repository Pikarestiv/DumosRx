/** Row shape returned by getProductHistory()'s auditLogs query — the raw
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
}
