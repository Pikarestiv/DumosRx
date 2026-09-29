"use client";

import { format } from "date-fns";
import { CheckCircle2, FileText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import type { RecentDownload } from "@/lib/hooks/use-report-export";

export function RecentDownloadsEmptyState() {
  return (
    <EmptyState
      icon={CheckCircle2}
      title="No reports generated yet"
      description="Export a report to see it here."
    />
  );
}

export function RecentDownloadsList({
  downloads,
  limit = 4,
}: {
  downloads: RecentDownload[];
  limit?: number;
}) {
  return (
    <div className="space-y-3">
      {downloads.slice(0, limit).map((dl) => (
        <div
          key={dl.id}
          className="flex items-start gap-3 p-3 rounded-xl border bg-primary/5"
        >
          <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1 w-full">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold truncate">{dl.name}</p>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {dl.type}
            </p>
            <div className="flex flex-col gap-0.5 mt-1">
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(dl.generatedAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {dl.sizeLabel}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
