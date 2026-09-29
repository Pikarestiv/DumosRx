"use client";

import { Loader2, ShieldAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStoreStaff } from "@/lib/api/admin-hooks";

interface StoreStaffListProps {
  storeId: string | null | undefined;
  /** Shown when the store has no staff yet. */
  emptyLabel?: string;
}

export function StoreStaffList({
  storeId,
  emptyLabel = "This store has no staff accounts yet.",
}: StoreStaffListProps) {
  const { data, isLoading, isError } = useStoreStaff(storeId);
  const staff = data?.data ?? [];
  const total = data?.meta?.total ?? staff.length;

  if (!storeId) {
    return (
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        This account owns no store, so it has no staff.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-6 text-rose-500">
        <ShieldAlert className="h-4 w-4" />
        <span className="text-sm font-bold">Failed to load staff accounts.</span>
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{emptyLabel}</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <Users className="h-3 w-3" />
        {total} staff account{total === 1 ? "" : "s"}
        {total > staff.length ? ` · showing first ${staff.length}` : ""}
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
        {staff.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-4 p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-xs text-slate-400">
                {member.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {member.name}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{member.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="font-bold bg-slate-500/10 text-slate-500 border-slate-500/20">
                {member.role}
              </Badge>
              <Badge
                className={
                  member.status === "Active"
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : "bg-slate-400 hover:bg-slate-500"
                }
              >
                {member.status}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
