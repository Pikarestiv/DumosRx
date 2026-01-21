"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const SubscriptionCard = dynamic(
  () =>
    import("@/components/dashboard/subscription-card").then(
      (mod) => mod.SubscriptionCard,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-sm h-[300px] rounded-xl border bg-card text-card-foreground shadow space-y-4 p-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    ),
  },
);

export function SubscriptionWrapper() {
  return <SubscriptionCard />;
}
