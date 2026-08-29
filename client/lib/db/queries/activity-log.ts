import { query } from "@/lib/db/local-database";
import type { AuditLogRow } from "@/lib/types/audit-log";

export type ActivityLogSortKey = "created_at" | "action" | "user_name";

// Whitelisted, not interpolated from arbitrary caller input: sortKey/
// sortDirection end up inside the SQL string directly (SQLite doesn't
// support parameterized ORDER BY column/direction), so only values that
// resolve through this map/ternary can ever reach the query.
const SORT_COLUMNS: Record<ActivityLogSortKey, string> = {
  created_at: "al.created_at",
  action: "al.action",
  user_name: "user_name",
};

export interface ActivityLogFilters {
  from?: string;
  to?: string;
  action?: string;
  userId?: string;
  role?: string;
  tableName?: string;
  page?: number;
  pageSize?: number;
  sortKey?: ActivityLogSortKey;
  sortDirection?: "asc" | "desc";
}

export interface ActivityLogResult {
  rows: AuditLogRow[];
  total: number;
}

/** The general-purpose, paginated version of what getProductHistory() does
 * for a single product: every audit_logs row, across every table, with
 * optional date/action/user filters. Distinct from the dashboard's small
 * "Recent Activity" widget (which reads from sales/stock_movements/etc.
 * directly, not audit_logs); this is the full trail. */
export async function getActivityLog(
  filters: ActivityLogFilters = {},
): Promise<ActivityLogResult> {
  const { from, to, action, userId, role, tableName, page = 1, pageSize = 50, sortKey = "created_at", sortDirection = "desc" } = filters;

  const conditions: string[] = ["(al._deleted = 0 OR al._deleted IS NULL)"];
  const params: (string | number)[] = [];

  if (from) {
    conditions.push("al.created_at >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("al.created_at <= ?");
    params.push(to);
  }
  if (action) {
    conditions.push("al.action = ?");
    params.push(action);
  }
  if (userId) {
    conditions.push("al.user_id = ?");
    params.push(userId);
  }
  if (role) {
    conditions.push("u.role = ?");
    params.push(role);
  }
  if (tableName) {
    conditions.push("al.table_name = ?");
    params.push(tableName);
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE ${where}`,
    params,
  );
  const total = countResult[0]?.count || 0;

  const offset = Math.max(0, (page - 1) * pageSize);
  const orderColumn = SORT_COLUMNS[sortKey] ?? SORT_COLUMNS.created_at;
  const orderDir = sortDirection === "asc" ? "ASC" : "DESC";
  const rows = await query<AuditLogRow>(
    `SELECT al.*, TRIM(u.first_name || ' ' || u.last_name) as user_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE ${where}
     ORDER BY ${orderColumn} ${orderDir}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return { rows: rows || [], total };
}

export async function getDistinctActivityActions() {
  const rows = await query<{ action: string }>(
    "SELECT DISTINCT action FROM audit_logs WHERE (_deleted = 0 OR _deleted IS NULL) ORDER BY action ASC",
  );
  return rows.map((r) => r.action);
}

export async function getDistinctActivityUsers() {
  return query<{ user_id: string; user_name: string }>(
    `SELECT DISTINCT al.user_id, TRIM(u.first_name || ' ' || u.last_name) as user_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE (al._deleted = 0 OR al._deleted IS NULL) AND al.user_id IS NOT NULL
     ORDER BY user_name ASC`,
  );
}
