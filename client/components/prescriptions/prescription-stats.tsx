"use client";

import { usePrescriptionQueue } from "@/lib/hooks/use-prescription-queue";
import { Card } from "@/components/ui/card";

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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <Card
        className="border border-amber-200 rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] cursor-pointer hover:border-amber-500 transition-colors"
        onClick={() => setStatusFilter("pending")}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="text-[12.5px] text-muted-foreground font-medium">Needs verification</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
          </div>
        </div>
        <div className="text-2xl font-semibold font-serif tracking-tight mb-1.5 text-amber-700">{stats.pending}</div>
        <div className="text-xs text-muted-foreground">awaiting pharmacist review</div>
      </Card>

      <Card
        className="border border-border rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] cursor-pointer hover:border-primary transition-colors"
        onClick={() => setStatusFilter("processing")}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="text-[12.5px] text-muted-foreground font-medium">In Progress</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-2.64-6.36M21 4v6h-6"/></svg>
          </div>
        </div>
        <div className="text-2xl font-semibold font-serif tracking-tight mb-1.5">{stats.inProgress}</div>
        <div className="text-xs text-muted-foreground">being filled right now</div>
      </Card>

      <Card
        className="border border-emerald-200 rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] cursor-pointer hover:border-emerald-500 transition-colors"
        onClick={() => setStatusFilter("ready")}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="text-[12.5px] text-muted-foreground font-medium">Ready for pickup</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
        </div>
        <div className="text-2xl font-semibold font-serif tracking-tight mb-1.5 text-emerald-700">{stats.ready}</div>
        <div className="text-xs text-muted-foreground">notify patients waiting</div>
      </Card>

      <Card
        className="border border-border rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] cursor-pointer hover:border-primary transition-colors"
        onClick={() => setStatusFilter("completed")}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="text-[12.5px] text-muted-foreground font-medium">Filled today</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8v4h8V3z"/></svg>
          </div>
        </div>
        <div className="text-2xl font-semibold font-serif tracking-tight mb-1.5">{stats.filledToday || 0}</div>
        <div className="text-xs font-semibold">
          {(() => {
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
        </div>
      </Card>
    </div>
  );
}
