import { differenceInCalendarDays, parseISO } from "date-fns";
import type { PurchaseOrder } from "@/lib/db/procurement";

export const STALE_DRAFT_DAYS = 30;

export function draftAge(order: Pick<PurchaseOrder, "status" | "created_at" | "updated_at">, now: Date): { label: string; stale: boolean } | null {
  if (order.status !== "pending") return null;
  const touched = order.updated_at || order.created_at;
  if (!touched) return null;
  const days = Math.max(0, differenceInCalendarDays(now, parseISO(touched)));
  if (days >= STALE_DRAFT_DAYS) return { label: `Untouched ${days} days: receive, send or delete it`, stale: true };
  return { label: days === 0 ? "Edited today" : `${days} ${days === 1 ? "day" : "days"} old`, stale: false };
}

export function DraftAgeBadge({ order }: { order: PurchaseOrder }) {
  const age = draftAge(order, new Date());
  if (!age) return null;
  return (
    <span className={`text-[11px] font-medium ${age.stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
      {age.label}
    </span>
  );
}
