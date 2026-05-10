"use client";

import { 
  Users, 
  Store, 
  Package, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Globe,
  Database,
  ShieldAlert,
  ChevronRight,
  MoreHorizontal,
  Plus
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
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

// Mock global stats
const globalStats = [
  {
    name: "Total Pharmacies",
    value: "1,284",
    change: "+12.5%",
    trend: "up",
    icon: Store,
    color: "indigo"
  },
  {
    name: "Active Users",
    value: "8,492",
    change: "+18.2%",
    trend: "up",
    icon: Users,
    color: "blue"
  },
  {
    name: "Platform Revenue",
    value: "₦12.4M",
    change: "+5.4%",
    trend: "up",
    icon: TrendingUp,
    color: "emerald"
  },
  {
    name: "Global Inventory",
    value: "142k",
    change: "-2.1%",
    trend: "down",
    icon: Package,
    color: "amber"
  }
];

const recentPharmacies = [
  { id: "PH-921", name: "Ikeja Medical Center", owner: "Dr. Adebayo", plan: "Enterprise", status: "Active", date: "2h ago" },
  { id: "PH-920", name: "GreenLife Pharmacy", owner: "Sarah Jenkins", plan: "Pro", status: "Pending", date: "5h ago" },
  { id: "PH-919", name: "Unity Health Plus", owner: "Michael Okoro", plan: "Free", status: "Active", date: "1d ago" },
  { id: "PH-918", name: "SwiftCure Pharma", owner: "John Doe", plan: "Enterprise", status: "Inactive", date: "2d ago" },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Global Control</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Real-time platform performance and monitoring</p>
        </div>
        <div className="flex items-center gap-3">
            <Button variant="outline" className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800">
                <Database className="h-4 w-4 mr-2 text-indigo-500" />
                Backup System
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20">
                <Plus className="h-4 w-4 mr-2" />
                Invite Partner
            </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {globalStats.map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 group hover:border-indigo-500/50 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-2xl bg-${stat.color}-500/10 text-${stat.color}-500 group-hover:bg-${stat.color}-500 group-hover:text-white transition-all duration-300`}>
                <stat.icon className="h-6 w-6" />
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
        ))}
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
                {recentPharmacies.map((pharmacy) => (
                  <TableRow key={pharmacy.id} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
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
                        <span className="text-sm font-black text-white">1.2M</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-slate-400">Sync Success Rate</span>
                        <span className="text-sm font-black text-emerald-400">99.98%</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-slate-400">Active WebSocket Connections</span>
                        <span className="text-sm font-black text-indigo-400">421</span>
                    </div>
                </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-black text-slate-900 dark:text-white">Security Alerts</h3>
                <Badge variant="outline" className="bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 font-bold">3 High</Badge>
            </div>
            <div className="space-y-4">
                {[
                    { title: "Multiple 401s", source: "Ikeja API", time: "12m ago" },
                    { title: "New Admin Created", source: "System", time: "1h ago" },
                    { title: "Large Export Initiated", source: "Sarah's Pharmacy", time: "3h ago" },
                ].map((alert, i) => (
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
            </div>
            <Button variant="ghost" className="w-full mt-6 text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl py-6">View Audit Log</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
