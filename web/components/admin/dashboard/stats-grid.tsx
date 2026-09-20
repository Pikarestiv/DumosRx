import { Users, Store, Package, TrendingUp, ArrowUpRight, ArrowDownRight, Activity, type LucideIcon } from "lucide-react";
import type { AdminStat } from "@/lib/types/admin";

const ICON_MAP: Record<string, LucideIcon> = {
  Store: Store,
  Users: Users,
  TrendingUp: TrendingUp,
  Package: Package
};

/** Tailwind only emits classes it can see written out in full at build time,
 * so these can never be interpolated from `stat.color`. Keys cover every
 * colour AdminPlatformService::getPlatformSummary() actually sends
 * (indigo/blue/emerald/amber); anything else falls back to FALLBACK_COLOR. */
const COLOR_CLASSES: Record<string, string> = {
  indigo:
    "bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white",
  blue: "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white",
  emerald:
    "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white",
  amber:
    "bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white",
};

const FALLBACK_COLOR =
  "bg-slate-500/10 text-slate-500 group-hover:bg-slate-500 group-hover:text-white";

export function StatsGrid({ globalStats }: { globalStats: AdminStat[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {globalStats.map((stat, i: number) => {
        const Icon = ICON_MAP[stat.icon] || Activity;
        return (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 group hover:border-indigo-500/50 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-2xl transition-all duration-300 ${COLOR_CLASSES[stat.color] || FALLBACK_COLOR}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className={`flex items-center gap-1 text-xs font-bold ${stat.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                {stat.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {stat.change}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{stat.name}</p>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stat.value}</h3>
            </div>
          </div>
        );
      })}
    </div>
  );
}
