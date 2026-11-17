"use client";

import { reportAge } from "@/lib/admin/report-age";
import { formatDateSafe } from "@/lib/utils/date-utils";

export function ReportedAt({ reportedAt }: { reportedAt: string }) {
  const exact = formatDateSafe(reportedAt, "dd/MM/yyyy HH:mm", "");
  const age = reportAge(reportedAt);

  if (!age) return <p className="text-xs tabular-nums text-muted-foreground">{exact}</p>;

  return (
    <p
      className={`text-xs tabular-nums ${age.old ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
      title={age.old ? "An old reading: the till may have caught up since it reported." : undefined}
    >
      {`Reported ${age.label} · ${exact}`}
    </p>
  );
}
