"use client";

import { useEffect, useState } from "react";
import { 
  Server, 
  Activity, 
  Database, 
  Cpu, 
  HardDrive, 
  ShieldCheck, 
  Zap, 
  Globe, 
  AlertCircle,
  RefreshCcw,
  CheckCircle2,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { useAdminStore } from "@/lib/store/use-admin-store";

export default function SystemHealthPage() {
  const { systemHealth, loading, fetchHealth } = useAdminStore();

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const refreshHealth = () => {
    fetchHealth();
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">System Health</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium italic flex items-center gap-2">
            <Globe className="h-4 w-4 text-indigo-500" />
            Global Infrastructure Monitoring • Cluster: US-EAST-1
          </p>
        </div>
        <div className="flex items-center gap-3">
            <Button 
                variant="outline" 
                className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
                onClick={refreshHealth}
                disabled={loading}
            >
                <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Run Diagnostics
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20">
                System Status Page
            </Button>
        </div>
      </div>

      {/* Main Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className={cn(
              "border-none text-white shadow-lg",
              systemHealth?.overallStatus === 'Healthy' ? "bg-emerald-500 shadow-emerald-500/20" : "bg-rose-500 shadow-rose-500/20"
          )}>
              <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-white/20 rounded-lg">
                          {systemHealth?.overallStatus === 'Healthy' ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
                      </div>
                      <Badge className="bg-white/20 text-white border-none font-bold">
                          {systemHealth?.overallStatus || 'Checking...'}
                      </Badge>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest opacity-80">Overall System Status</h3>
                  <p className="text-3xl font-black mt-1">
                      {systemHealth?.overallStatus === 'Healthy' ? 'All Systems Go' : 'Nodes Degrading'}
                  </p>
              </CardContent>
          </Card>

          <Card className="border-none bg-slate-900 text-white shadow-sm">
              <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-white/10 rounded-lg text-indigo-400">
                          <Clock className="h-6 w-6" />
                      </div>
                      <Badge className="bg-indigo-500 text-white border-none font-bold">Stable</Badge>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest opacity-60">Platform Uptime</h3>
                  <p className="text-3xl font-black mt-1">{systemHealth?.uptime || '---'}</p>
              </CardContent>
          </Card>

          <Card className="border-none bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
              <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                          <Zap className="h-6 w-6" />
                      </div>
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 font-bold">High Performance</Badge>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">API Latency (P99)</h3>
                  <p className="text-3xl font-black mt-1 text-slate-900 dark:text-white">{systemHealth?.latency || '42ms'}</p>
              </CardContent>
          </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
          {/* Server Resources */}
          <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
              <CardHeader>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                      <Server className="h-5 w-5 text-indigo-500" />
                      Server Resources
                  </CardTitle>
                  <CardDescription>Real-time resource utilization across the cluster</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                  <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 font-bold">
                              <Cpu className="h-4 w-4 text-slate-400" />
                              CPU Utilization
                          </div>
                          <span className="font-black text-indigo-500">{systemHealth?.resources?.cpu || 0}%</span>
                      </div>
                      <Progress value={systemHealth?.resources?.cpu || 0} className="h-2 bg-slate-100 dark:bg-slate-800" />
                  </div>

                  <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 font-bold">
                              <Activity className="h-4 w-4 text-slate-400" />
                              Memory Usage (RAM)
                          </div>
                          <span className="font-black text-emerald-500">
                              {systemHealth?.resources?.memory?.used} / {systemHealth?.resources?.memory?.total}
                          </span>
                      </div>
                      <Progress value={systemHealth?.resources?.memory?.percent || 0} className="h-2 bg-slate-100 dark:bg-slate-800" />
                  </div>

                  <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 font-bold">
                              <HardDrive className="h-4 w-4 text-slate-400" />
                              Disk Space (NVMe)
                          </div>
                          <span className="font-black text-amber-500">
                              {systemHealth?.resources?.disk?.used} / {systemHealth?.resources?.disk?.total}
                          </span>
                      </div>
                      <Progress value={systemHealth?.resources?.disk?.percent || 0} className="h-2 bg-slate-100 dark:bg-slate-800" />
                  </div>

                  <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 font-bold">
                              <Database className="h-4 w-4 text-slate-400" />
                              Database Load
                          </div>
                          <span className="font-black text-indigo-500">{systemHealth?.resources?.database?.load || 0}%</span>
                      </div>
                      <Progress value={systemHealth?.resources?.database?.load || 0} className="h-2 bg-slate-100 dark:bg-slate-800" />
                  </div>
              </CardContent>
          </Card>

          {/* Infrastructure Nodes */}
          <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
              <CardHeader>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                      <Globe className="h-5 w-5 text-indigo-500" />
                      Infrastructure Nodes
                  </CardTitle>
                  <CardDescription>Status of global API gateways and edge locations</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(systemHealth?.nodes || []).map((node: any, i: number) => (
                          <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <div className="flex items-center gap-3">
                                  <div className={cn(
                                      "h-2 w-2 rounded-full animate-pulse",
                                      node.status === 'Operational' ? "bg-emerald-500" : "bg-rose-500"
                                  )} />
                                  <div>
                                      <p className="text-sm font-bold text-slate-900 dark:text-white">{node.name}</p>
                                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{node.location}</p>
                                  </div>
                              </div>
                              <div className="flex items-center gap-4">
                                  <span className="text-[10px] font-black text-indigo-500">{node.latency}</span>
                                  <Badge className={cn(
                                      "border-none font-bold text-[10px]",
                                      node.status === 'Operational' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                                  )}>
                                      {node.status === 'Operational' ? 'Active' : 'Issue'}
                                  </Badge>
                              </div>
                          </div>
                      ))}
                  </div>
              </CardContent>
          </Card>
      </div>
    </div>
  );
}
