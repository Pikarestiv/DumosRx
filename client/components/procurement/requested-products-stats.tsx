"use client";

import { ClipboardList, Clock, CheckCircle2 } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { RequestedProduct } from "@/lib/db/requested-products-queries";

interface RequestedProductsStatsProps {
  requests: RequestedProduct[];
}

export function RequestedProductsStats({
  requests,
}: RequestedProductsStatsProps) {
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const orderedCount = requests.filter((r) => r.status === "ordered").length;

  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0 mb-5">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-b-0 border-l-0 border-r-0 sm:border"
          title="Total requests"
          value={<span className="font-serif">{requests.length}</span>}
          icon={<ClipboardList className="w-4 h-4" />}
          iconBgClass="bg-muted text-muted-foreground"
        />

        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-b-0 border-l-0 border-r-0 sm:border"
          title="Pending"
          value={<span className="font-serif">{pendingCount}</span>}
          icon={<Clock className="w-4 h-4" />}
          iconBgClass="bg-amber-500/10 text-amber-600"
        />

        <MetricCard
          className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-b-0 border-l-0 border-r-0 sm:border"
          title="Ordered"
          value={<span className="font-serif">{orderedCount}</span>}
          icon={<CheckCircle2 className="w-4 h-4" />}
          iconBgClass="bg-emerald-500/10 text-emerald-600"
        />
      </div>
    </div>
  );
}
