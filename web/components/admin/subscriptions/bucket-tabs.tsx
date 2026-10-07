"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminSubscriptionFigures, SubscriptionBucket } from "@/lib/types/admin";

type BucketCounts = AdminSubscriptionFigures["bucket_counts"];

export const BUCKETS: Array<{
  id: SubscriptionBucket;
  label: string;
  countOf: (counts: BucketCounts) => number;
}> = [
  { id: "expiring", label: "Expiring", countOf: (counts) => counts.expiring },
  { id: "trials", label: "Trials ending", countOf: (counts) => counts.trials },
  { id: "lapsed", label: "Lapsed", countOf: (counts) => counts.lapsed },
  { id: "payments", label: "Payments", countOf: (counts) => counts.payments },
];

export function BucketTabsList({ counts }: { counts?: BucketCounts }) {
  return (
    <TabsList className="mb-4 bg-muted w-full flex overflow-x-auto whitespace-nowrap justify-start p-1 h-12 gap-1">
      {BUCKETS.map((bucket) => (
        <TabsTrigger key={bucket.id} value={bucket.id} className="px-4 shrink-0 gap-2">
          {bucket.label}
          {counts && (
            <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-bold text-muted-foreground">
              {bucket.countOf(counts)}
            </span>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
