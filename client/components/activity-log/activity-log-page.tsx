"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  getActivityLog,
  getDistinctActivityActions,
  getDistinctActivityUsers,
} from "@/lib/db/queries/activity-log";
import { useAuth, checkCanViewAllActivity } from "@/lib/context/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { STAFF_ROLES } from "@/lib/constants/roles";
import { ResponsiveDetailPanel } from "@/components/ui/responsive-detail-panel";
import { ActivityLogDetailPanel } from "./activity-log-detail-panel";
import { formatActionLabel } from "./format-action-label";
import type { AuditLogRow } from "@/lib/types/audit-log";

const PAGE_SIZE = 50;

export function ActivityLogPage() {
  const { user } = useAuth();
  const canViewAll = checkCanViewAllActivity(user?.role);

  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<AuditLogRow | null>(null);

  const filters = {
    action: actionFilter === "all" ? undefined : actionFilter,
    userId: !canViewAll ? user?.id : userFilter === "all" ? undefined : userFilter,
    role: canViewAll && roleFilter !== "all" ? roleFilter : undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    ...queryKeys.activityLog.list(JSON.stringify(filters)),
    queryFn: () => getActivityLog(filters),
  });

  const { data: actions = [] } = useQuery({
    ...queryKeys.activityLog.actions(),
    queryFn: () => getDistinctActivityActions(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ["activityLogUsers"],
    queryFn: () => getDistinctActivityUsers(),
    enabled: canViewAll,
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <History className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[17px] font-serif font-bold">Activity Log</div>
          <div className="text-[12.5px] text-muted-foreground">
            Every recorded action across the store, {total} total
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px] h-9 text-[12.5px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a} value={a}>
                {formatActionLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canViewAll && (
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] h-9 text-[12.5px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {canViewAll && (
          <Select
            value={userFilter}
            onValueChange={(v) => {
              setUserFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] h-9 text-[12.5px]">
              <SelectValue placeholder="Staff member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.user_name || "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card className="border rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold sticky top-0">
                <th className="text-left px-4 py-2.5">Action</th>
                <th className="text-left px-4 py-2.5">Table</th>
                <th className="text-left px-4 py-2.5">By</th>
                <th className="text-left px-4 py-2.5">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No activity found for this filter.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-accent/30 cursor-pointer"
                  onClick={() => setSelectedEntry(row)}
                >
                  <td className="px-4 py-2.5 font-semibold text-foreground">
                    {formatActionLabel(row.action)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {row.table_name || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {row.user_name?.trim() || "System"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {row.created_at
                      ? format(new Date(row.created_at), "d MMM yyyy, h:mm a")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
          <span className="text-[12px] text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      <ResponsiveDetailPanel
        open={!!selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      >
        <ActivityLogDetailPanel
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      </ResponsiveDetailPanel>
    </div>
  );
}
