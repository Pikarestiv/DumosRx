import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyReportStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  className?: string;
}

/** Shared "nothing for this filter" state for report/analytics cards -
 * consolidates the ad hoc empty messages each tab used to render on its own
 * (e.g. sales-analytics-tab.tsx's old NoPeriodSalesData). */
export function EmptyReportState({
  icon: Icon = Inbox,
  title = "No sales yet",
  description = "There's no data for the selected filters. Try widening the date range or clearing a filter.",
  className,
}: EmptyReportStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-10 text-center text-muted-foreground ${className ?? ""}`}>
      <Icon className="h-8 w-8 opacity-20 mb-3" />
      <p className="font-semibold text-[13.5px] text-foreground">{title}</p>
      <p className="text-[12px] mt-1 max-w-xs">{description}</p>
    </div>
  );
}
