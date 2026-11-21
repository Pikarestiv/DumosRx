import type { AuditLogRow } from "@/lib/types/audit-log";

export interface GroupedActivityRow {
  primary: AuditLogRow;
  group: AuditLogRow[];
}

const COLLAPSIBLE_AUTH_ACTIONS = new Set([
  "LOGIN",
  "LOGOUT",
  "LOGIN_FAILED",
  "PIN_CHANGED",
]);

export function groupByCorrelation(rows: AuditLogRow[]): GroupedActivityRow[] {
  const result: GroupedActivityRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const current = rows[i];
    const correlationId = current.correlation_id;
    if (correlationId) {
      let j = i;
      const group: AuditLogRow[] = [];
      while (j < rows.length && rows[j].correlation_id === correlationId) {
        group.push(rows[j]);
        j++;
      }
      const primary = group.find((r) => r.table_name === "sales") || group[0];
      result.push({ primary, group });
      i = j;
      continue;
    }

    const actionKey = (current.action || "").toUpperCase();
    if (COLLAPSIBLE_AUTH_ACTIONS.has(actionKey)) {
      let j = i;
      const group: AuditLogRow[] = [];
      while (
        j < rows.length &&
        !rows[j].correlation_id &&
        (rows[j].action || "").toUpperCase() === actionKey &&
        (rows[j].user_id === current.user_id ||
          rows[j].user_name === current.user_name)
      ) {
        group.push(rows[j]);
        j++;
      }
      const totalOccurrences = group.reduce(
        (sum, r) => sum + (r.occurrence_count || 1),
        0,
      );
      const primary: AuditLogRow = {
        ...current,
        occurrence_count:
          totalOccurrences > 1 ? totalOccurrences : current.occurrence_count,
      };
      result.push({ primary, group });
      i = j;
      continue;
    }

    result.push({ primary: current, group: [current] });
    i++;
  }
  return result;
}
