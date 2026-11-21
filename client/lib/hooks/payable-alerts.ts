import { AlertTriangle, CalendarClock } from "lucide-react";
import { formatCurrency, pluralize } from "@/lib/utils";
import type { PayablesDueSummary } from "@/lib/db/queries/payables";
import type { AlertItem } from "@/lib/hooks/use-action-center-alerts";

export function buildPayableAlerts(summary: PayablesDueSummary | undefined, currencyCode?: string): AlertItem[] {
  if (!summary) return [];
  const alerts: AlertItem[] = [];
  if (summary.overdueCount > 0) {
    alerts.push({
      id: "payables-overdue",
      title: `${summary.overdueCount} Supplier ${pluralize(summary.overdueCount, "Payment")} Overdue`,
      description: `${formatCurrency(summary.overdueTotal, currencyCode)} outstanding past its due date.`,
      icon: AlertTriangle,
      priority: "critical",
      actionLabel: "View Orders",
      actionRoute: "/procurement?status=overdue",
    });
  }
  if (summary.dueSoonCount > 0) {
    alerts.push({
      id: "payables-due-soon",
      title: `${summary.dueSoonCount} Supplier ${pluralize(summary.dueSoonCount, "Payment")} Due Soon`,
      description: `${formatCurrency(summary.dueSoonTotal, currencyCode)} due within 3 days.`,
      icon: CalendarClock,
      priority: "warning",
      actionLabel: "View Orders",
      actionRoute: "/procurement?status=due-soon",
    });
  }
  return alerts;
}
