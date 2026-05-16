"use client";

import { useEffect, useState } from "react";
import { 
  Users, 
  Store, 
  Package, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Globe,
  ShieldAlert,
  ChevronRight,
  Database,
  Plus,
  Loader2,
  Calendar,
  ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAdminSummary } from "@/lib/api/admin-hooks";
import { useRouter } from "next/navigation";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";

const ICON_MAP: any = {
  Store: Store,
  Users: Users,
  TrendingUp: TrendingUp,
  Package: Package
};

export default function AdminDashboard() {
  const { data: summary, isLoading, error, refetch } = useAdminSummary();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPharmacy, setSelectedPharmacy] = useState<any>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading && !summary) {
    return <AdminSkeleton />;
  }

  if (error && !summary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-full">
            <ShieldAlert className="h-10 w-10" />
        </div>
        <p className="text-rose-500 font-bold">{error instanceof Error ? error.message : "Failed to sync platform data"}</p>
        <Button onClick={() => refetch()} variant="outline">Retry Sync</Button>
      </div>
    );
  }

  const globalStats = summary?.stats || [];
  const recentPharmacies = summary?.recent_pharmacies || [];
  const liveOperations = summary?.live_operations || {};
  const securityAlerts = summary?.security_alerts || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Global Control</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium italic">
            Connected to Production Cluster • {currentTime.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
            <Button 
                variant="outline" 
                className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
                onClick={() => refetch()}
                disabled={isLoading}
            >
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2 text-indigo-500" />}
                Refresh Pulse
            </Button>
            <Button 
                className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
                onClick={() => router.push("/admin/pharmacies/new")}
            >
                <Plus className="h-4 w-4 mr-2" />
                Register Pharmacy
            </Button>
        </div>
      </div>

      {/* Stats Grid */}
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

      {/* Main Content Sections */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Recent Registrations Table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Recent Pharmacies</h3>
              <p className="text-xs font-medium text-slate-500">Newly registered business instances</p>
            </div>
            <Button variant="ghost" size="sm" className="text-indigo-600 font-bold hover:bg-indigo-50">View All</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800">
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6">Pharmacy Name</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400">Owner</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Plan</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Status</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right pr-6">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPharmacies.map((pharmacy: any) => (
                  <TableRow 
                    key={pharmacy.id} 
                    className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group cursor-pointer"
                    onClick={() => setSelectedPharmacy(pharmacy)}
                  >
                    <TableCell className="pl-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{pharmacy.name}</span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{pharmacy.id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-slate-600 dark:text-slate-400">{pharmacy.owner}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 font-bold text-[10px]">
                        {pharmacy.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`h-1.5 w-1.5 rounded-full ${pharmacy.status === 'Active' ? 'bg-emerald-500' : pharmacy.status === 'Pending' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{pharmacy.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6 font-medium text-slate-500 text-sm italic">{pharmacy.date}</TableCell>
                  </TableRow>
                ))}
                {recentPharmacies.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={5} className="text-center py-8 text-slate-400 font-medium">No recent registrations found</TableCell>
                   </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* System Activity & Health */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <Globe className="h-32 w-32 text-white" />
            </div>
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="h-5 w-5 text-indigo-400 animate-pulse" />
                    <h3 className="text-lg font-black text-white">Live Operations</h3>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-slate-400">Total API Requests</span>
                        <span className="text-sm font-black text-white">{liveOperations.total_requests || '0'}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-slate-400">Sync Success Rate</span>
                        <span className="text-sm font-black text-emerald-400">{liveOperations.sync_success_rate || '100%'}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-slate-400">Active WebSocket Connections</span>
                        <span className="text-sm font-black text-indigo-400">{liveOperations.active_connections || '0'}</span>
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
                {securityAlerts.map((alert: any, i: number) => (
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
      </div>

      <Dialog open={!!selectedPharmacy} onOpenChange={() => setSelectedPharmacy(null)}>
        <DialogContent className="max-w-2xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
          {selectedPharmacy && (
            <div className="bg-white dark:bg-slate-900">
              <div className="bg-indigo-600 p-8 text-white relative">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Store className="h-24 w-24" />
                </div>
                <Badge className="bg-white/20 text-white border-none mb-4 font-bold">{selectedPharmacy.plan} Partner</Badge>
                <DialogTitle className="text-3xl font-black tracking-tight">{selectedPharmacy.name}</DialogTitle>
                <p className="text-indigo-100 font-medium mt-1 uppercase text-xs tracking-widest">ID: {selectedPharmacy.id}</p>
              </div>
              
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Store Owner</p>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-indigo-500" />
                      <p className="font-bold text-slate-900 dark:text-white">{selectedPharmacy.owner}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registration Date</p>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-indigo-500" />
                      <p className="font-bold text-slate-900 dark:text-white">{selectedPharmacy.date}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</p>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${selectedPharmacy.status === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <p className="font-bold text-slate-900 dark:text-white">{selectedPharmacy.status}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Hash</p>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-indigo-500" />
                      <p className="font-mono text-xs font-bold text-slate-500">SEC-OP-{selectedPharmacy.id.substring(0, 6)}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                  <Button 
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl h-12"
                    onClick={() => {
                      router.push(`/admin/pharmacies?search=${selectedPharmacy.id}`);
                      setSelectedPharmacy(null);
                    }}
                  >
                    View Full Profile
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 font-bold rounded-xl h-12 border-slate-200"
                    onClick={() => setSelectedPharmacy(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
