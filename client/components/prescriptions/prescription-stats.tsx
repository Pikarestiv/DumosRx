"use client";

import { usePrescriptionQueue } from "@/lib/hooks/use-prescription-queue";

interface PrescriptionStatsProps {
  stats: {
    pending: number;
    inProgress: number;
    ready: number;
    urgent: number;
    filledToday?: number;
  };
}

export function PrescriptionStats({ stats }: PrescriptionStatsProps) {
  const { setStatusFilter } = usePrescriptionQueue();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <div 
        className="bg-[#FFFFFF] border border-[#FEE3B3] rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] cursor-pointer hover:border-[#F79009] transition-colors"
        onClick={() => setStatusFilter("pending")}
      >
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[12.5px] text-[#667085] font-medium">Needs verification</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FFFAEB] text-[#B54708]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
          </div>
        </div>
        <div className="text-2xl font-semibold font-['Playfair_Display'] tracking-tight mb-1.5 text-[#B54708]">{stats.pending}</div>
        <div className="text-xs text-[#98A2B3]">awaiting pharmacist review</div>
      </div>

      <div 
        className="bg-[#FFFFFF] border border-[#E6EAF2] rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] cursor-pointer hover:border-[#2054E0] transition-colors"
        onClick={() => setStatusFilter("inProgress")}
      >
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[12.5px] text-[#667085] font-medium">In Progress</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#F5F8FC] text-[#667085]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-2.64-6.36M21 4v6h-6"/></svg>
          </div>
        </div>
        <div className="text-2xl font-semibold font-['Playfair_Display'] tracking-tight mb-1.5">{stats.inProgress}</div>
        <div className="text-xs text-[#98A2B3]">being filled right now</div>
      </div>

      <div 
        className="bg-[#FFFFFF] border border-[#D3F2E1] rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] cursor-pointer hover:border-[#12B76A] transition-colors"
        onClick={() => setStatusFilter("ready")}
      >
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[12.5px] text-[#667085] font-medium">Ready for pickup</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#ECFDF3] text-[#067647]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
        </div>
        <div className="text-2xl font-semibold font-['Playfair_Display'] tracking-tight mb-1.5 text-[#067647]">{stats.ready}</div>
        <div className="text-xs text-[#98A2B3]">notify patients waiting</div>
      </div>

      <div 
        className="bg-[#FFFFFF] border border-[#E6EAF2] rounded-[14px] p-[18px] px-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.03)] cursor-pointer hover:border-[#2054E0] transition-colors"
        onClick={() => setStatusFilter("completed")}
      >
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[12.5px] text-[#667085] font-medium">Filled today</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#F5F8FC] text-[#667085]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8v4h8V3z"/></svg>
          </div>
        </div>
        <div className="text-2xl font-semibold font-['Playfair_Display'] tracking-tight mb-1.5">{stats.filledToday || 0}</div>
        <div className="text-xs font-semibold text-[#067647]">↑ 12% vs yesterday</div>
      </div>
    </div>
  );
}
