import { Prescription } from "@/lib/hooks/use-prescription-queue";

export const PRESCRIPTION_STATUS_META: Record<
  Prescription["status"],
  { label: string; badgeClass: string }
> = {
  pending: { label: "Needs verification", badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  in_progress: { label: "In progress", badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  ready: { label: "Ready for pickup", badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  dispensed: { label: "Dispensed", badgeClass: "bg-muted text-muted-foreground" },
  completed: { label: "Filled", badgeClass: "bg-muted text-muted-foreground" },
  on_hold: { label: "On hold", badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  partially_dispensed: { label: "Partially dispensed", badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  cancelled: { label: "Cancelled", badgeClass: "bg-destructive/10 text-destructive" },
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
