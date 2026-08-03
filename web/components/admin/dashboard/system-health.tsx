import { Globe, Activity, ShieldAlert, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import type { LiveOperations, SecurityAlert } from "@/lib/types/admin";

interface SystemHealthProps {
  liveOperations: LiveOperations;
  securityAlerts: SecurityAlert[];
}

export function SystemHealth({ liveOperations, securityAlerts }: SystemHealthProps) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Globe className="h-32 w-32 text-slate-900 dark:text-white" />
        </div>
        <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
                <Activity className="h-5 w-5 text-indigo-500 dark:text-indigo-400 animate-pulse" />
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Live Operations</h3>
            </div>
            <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Total API Requests</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">{liveOperations.total_requests || '0'}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Sync Success Rate</span>
                    <span className="text-sm font-black text-emerald-500 dark:text-emerald-400">{liveOperations.sync_success_rate || '100%'}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Active WebSocket Connections</span>
                    <span className="text-sm font-black text-indigo-500 dark:text-indigo-400">{liveOperations.active_connections || '0'}</span>
                </div>
            </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-slate-900 dark:text-white">Security Alerts</h3>
            <Badge variant="outline" className="bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 font-bold">
                {securityAlerts.length} Active
            </Badge>
        </div>
        <div className="space-y-4">
            {securityAlerts.map((alert, i: number) => (
                <div key={i} className="flex items-start gap-3 group cursor-pointer">
                    <div className="mt-1 p-1.5 bg-rose-500/10 text-rose-500 rounded-lg group-hover:bg-rose-500 group-hover:text-white transition-colors">
                        <ShieldAlert className="h-3 w-3" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-black text-slate-900 dark:text-slate-100">{alert.title}</p>
                        <p className="text-[10px] font-bold text-slate-500">{alert.source} • {alert.time}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500" />
                </div>
            ))}
            {securityAlerts.length === 0 && (
                <div className="text-center py-4">
                    <div className="bg-emerald-500/10 text-emerald-500 p-3 rounded-full inline-block mb-2">
                        <Activity className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-400">No security alerts detected</p>
                </div>
            )}
        </div>
        <Button 
            variant="outline" 
            className="w-full mt-6 text-xs font-black text-indigo-600 bg-indigo-50/50 border-indigo-100 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 rounded-xl py-6 transition-all"
            onClick={() => router.push("/admin/system")}
        >
            View Security Audit Trail
        </Button>
      </div>
    </div>
  );
}
