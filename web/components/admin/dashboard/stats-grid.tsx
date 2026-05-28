import { Users, Store, Package, TrendingUp, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";

const ICON_MAP: any = {
  Store: Store,
  Users: Users,
  TrendingUp: TrendingUp,
  Package: Package
};

export function StatsGrid({ globalStats }: { globalStats: any[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {globalStats.map((stat: any, i: number) => {
        const Icon = ICON_MAP[stat.icon] || Activity;
        return (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 group hover:border-indigo-500/50 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-2xl bg-${stat.color}-500/10 text-${stat.color}-500 group-hover:bg-${stat.color}-500 group-hover:text-white transition-all duration-300`}>
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
