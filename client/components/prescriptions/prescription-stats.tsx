"use client";

import { usePrescriptionQueue } from "@/lib/hooks/use-prescription-queue";
import { MetricCard } from "@/components/ui/metric-card";

interface PrescriptionStatsProps {
  stats: {
    pending: number;
    inProgress: number;
    ready: number;
    urgent: number;
    filledToday?: number;
    filledYesterday?: number;
  };
}

export function PrescriptionStats({ stats }: PrescriptionStatsProps) {
  const { setStatusFilter } = usePrescriptionQueue();

  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-4 gap-[10px] sm:gap-4 hide-scrollbar snap-x snap-mandatory">
      <MetricCard
        className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-amber-200 hover:border-amber-500"
        onClick={() => setStatusFilter("pending")}
        title="Needs verification"
        value={stats.pending}
        valueClassName="font-serif text-amber-700"
        icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>}
        iconBgClass="bg-amber-500/10 text-amber-700"
        description="awaiting pharmacist review"
      />

      <MetricCard
        className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border hover:border-primary"
        onClick={() => setStatusFilter("in_progress")}
        title="In Progress"
        value={stats.inProgress}
        valueClassName="font-serif"
        icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-2.64-6.36M21 4v6h-6"/></svg>}
        iconBgClass="bg-muted text-muted-foreground"
        description="being filled right now"
      />

      <MetricCard
        className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-emerald-200 hover:border-emerald-500"
        onClick={() => setStatusFilter("ready")}
        title="Ready for pickup"
        value={stats.ready}
        valueClassName="font-serif text-emerald-700"
        icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>}
        iconBgClass="bg-emerald-500/10 text-emerald-700"
        description="notify patients waiting"
      />

      <MetricCard
        className="min-w-[180px] sm:min-w-0 snap-center shrink-0 border-border hover:border-primary"
        onClick={() => setStatusFilter("completed")}
        title="Filled today"
        value={stats.filledToday || 0}
        valueClassName="font-serif"
        icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8v4h8V3z"/></svg>}
        iconBgClass="bg-muted text-muted-foreground"
        description={(() => {
          const today = stats.filledToday || 0;
          const yesterday = stats.filledYesterday || 0;
          if (yesterday === 0) {
            return today > 0 ? (
              <span className="text-emerald-600">↑ 100% vs yesterday</span>
            ) : (
              <span className="text-muted-foreground">No fills yet</span>
            );
          }
          const diff = today - yesterday;
          const percent = Math.round((diff / yesterday) * 100);
          if (percent > 0) return <span className="text-emerald-600">↑ {percent}% vs yesterday</span>;
          if (percent < 0) return <span className="text-red-600">↓ {Math.abs(percent)}% vs yesterday</span>;
          return <span className="text-muted-foreground">Same as yesterday</span>;
        })()}
        descriptionClassName="font-semibold"
      />
      </div>
    </div>
  );
}
