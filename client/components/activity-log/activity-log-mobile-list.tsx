"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  History,
  ShoppingCart,
  Package,
  PackagePlus,
  Truck,
  RotateCcw,
  Banknote,
  Users,
  Shield,
  FileText,
  KeyRound,
  SlidersHorizontal,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { describeActivity } from "./describe-activity";
import type { AuditLogRow } from "@/lib/types/audit-log";
import { groupByCorrelation } from "./activity-log-grouping";

function getActivityIcon(row: AuditLogRow): { icon: LucideIcon; color: string } {
  const table = (row.table_name || "").toLowerCase();
  const action = (row.action || "").toUpperCase();

  if (
    action === "LOGIN" ||
    action === "LOGOUT" ||
    action === "LOGIN_FAILED" ||
    action === "PIN_CHANGED" ||
    action === "TILL_RELINK_CODE_ISSUED"
  ) {
    return {
      icon: KeyRound,
      color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    };
  }
  if (table === "sales" || table === "sale_items" || table === "held_transactions") {
    return {
      icon: ShoppingCart,
      color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    };
  }
  if (table === "purchase_orders" || table === "purchase_order_items" || action.includes("PO")) {
    return {
      icon: Truck,
      color: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    };
  }
  if (table === "products") {
    return {
      icon: Package,
      color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
    };
  }
  if (
    table === "stock_batches" ||
    table === "stock_movements" ||
    action.includes("STOCK") ||
    action.includes("BATCH")
  ) {
    return {
      icon: PackagePlus,
      color: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
    };
  }
  if (table === "expenses") {
    return {
      icon: Banknote,
      color: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
    };
  }
  if (table === "returns" || table === "return_items" || action.includes("RETURN")) {
    return {
      icon: RotateCcw,
      color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    };
  }
  if (table === "customers" || table === "customer_payments") {
    return {
      icon: Users,
      color: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400",
    };
  }
  if (table === "users") {
    return {
      icon: Shield,
      color: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
    };
  }
  if (table === "prescriptions" || table === "prescription_items") {
    return {
      icon: FileText,
      color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
    };
  }
  if (table === "stock_audits") {
    return {
      icon: SlidersHorizontal,
      color: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
    };
  }
  return { icon: History, color: "bg-muted text-muted-foreground" };
}

export function ActivityLogMobileCard({
  row,
  group,
  onSelect,
}: {
  row: AuditLogRow;
  group: AuditLogRow[];
  onSelect: () => void;
}) {
  const { icon: Icon, color: iconColor } = getActivityIcon(row);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card shadow-sm cursor-pointer hover:bg-accent/50 active:bg-accent/70 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}
      >
        <Icon className="w-4 h-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-semibold text-foreground text-[13.5px] flex items-center gap-1.5 flex-wrap">
          <span className="truncate">{describeActivity(row)}</span>
          {group.length > 1 && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0">
              +{group.length - 1} more
            </span>
          )}
          {!!row.occurrence_count && row.occurrence_count > 1 && (
            <span
              className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0"
              title={`Repeated ${row.occurrence_count} times`}
            >
              ×{row.occurrence_count}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground mt-0.5 truncate">
          <span className="truncate">{row.user_name?.trim() || "System"}</span>
          <span>&middot;</span>
          <span className="shrink-0">
            {row.created_at
              ? format(new Date(row.created_at), "d MMM yyyy, h:mm a")
              : "N/A"}
          </span>
          {row.table_name && (
            <>
              <span>&middot;</span>
              <span className="text-muted-foreground/70 truncate capitalize">
                {row.table_name.replace(/_/g, " ")}
              </span>
            </>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </div>
  );
}

export function ActivityLogMobileList({
  rows,
  isLoading,
  onSelect,
}: {
  rows: AuditLogRow[];
  isLoading: boolean;
  onSelect: (row: AuditLogRow, related: AuditLogRow[]) => void;
}) {
  const groupedRows = useMemo(() => groupByCorrelation(rows), [rows]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl border border-border bg-card/60 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity found for this filter"
        className="py-12"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-6">
      {groupedRows.map(({ primary: row, group }) => (
        <ActivityLogMobileCard
          key={row.id}
          row={row}
          group={group}
          onSelect={() => onSelect(row, group)}
        />
      ))}
    </div>
  );
}
