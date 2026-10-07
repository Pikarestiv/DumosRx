import { Users, Store, Package, TrendingUp, BadgeCheck, RefreshCw, ArrowUpRight, Activity, type LucideIcon } from "lucide-react";
import type { AdminStat } from "@/lib/types/admin";
import { CurrencyStatValue } from "@/components/admin/dashboard/currency-stat-value";

const ICON_MAP: Record<string, LucideIcon> = {
  Store: Store,
  Users: Users,
  TrendingUp: TrendingUp,
  Package: Package,
  BadgeCheck: BadgeCheck,
  RefreshCw: RefreshCw,
};

/** Tailwind only emits classes it can see written out in full at build time,
 * so these can never be interpolated from `stat.color`. */
const COLOR_CLASSES: Record<string, string> = {
  indigo:
    "bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white",
  blue: "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white",
  emerald:
    "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white",
  amber:
    "bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white",
  violet:
    "bg-violet-500/10 text-violet-500 group-hover:bg-violet-500 group-hover:text-white",
  sky: "bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white",
};

const FALLBACK_COLOR =
  "bg-slate-500/10 text-slate-500 group-hover:bg-slate-500 group-hover:text-white";

export function StatsGrid({ globalStats }: { globalStats: AdminStat[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {globalStats.map((stat, i: number) => {
        const Icon = ICON_MAP[stat.icon] || Activity;
        return (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 group hover:border-indigo-500/50 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-2xl transition-all duration-300 ${COLOR_CLASSES[stat.color] || FALLBACK_COLOR}`}>
                <Icon className="h-6 w-6" />
              </div>
              {stat.change !== undefined && (
                <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                  {stat.trend === "up" && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
                  {stat.change}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{stat.name}</p>
              {stat.totals_by_currency ? (
                <div className="mt-1">
                  <CurrencyStatValue totals={stat.totals_by_currency} />
                </div>
              ) : (
                <h3 className="text-3xl font-black text-foreground mt-1">{stat.value}</h3>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
