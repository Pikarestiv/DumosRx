"use client";

import {
  Activity,
  ShieldAlert,
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Server,
  Database,
  Bug,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminHealth, useAdminErrors } from "@/lib/api/admin-hooks";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { DefaultAccountManagerCard } from "./default-account-manager-card";

const LEVEL_STYLES: Record<string, string> = {
  fatal: "bg-rose-500/10 text-rose-500",
  error: "bg-rose-500/10 text-rose-500",
  warning: "bg-amber-500/10 text-amber-500",
  info: "bg-blue-500/10 text-blue-500",
};

export default function SystemPage() {
  const { data: health, isLoading, error, refetch } = useAdminHealth();
  const { data: errorsData, isLoading: errorsLoading } = useAdminErrors();

  if (isLoading && !health) {
    return <AdminSkeleton />;
  }

  if (error && !health) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-full">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <p className="text-rose-500 font-bold">Failed to load system data</p>
        <Button onClick={() => refetch()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const resources = health?.resources || {
    cpu: 0,
    memory: { used: "0GB", percent: 0 },
    disk: { used: "0GB", percent: 0 },
    database: { load: 0, status: "Unknown" },
  };

  const nodes = health?.nodes || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            System Infrastructure
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Core service health and resource utilization (Uptime:{" "}
            {health?.uptime || "N/A"})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <Activity className="h-4 w-4 mr-2 text-indigo-500" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* System Metrics */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">CPU Load</p>
              <h3 className="text-2xl font-black">{resources.cpu}%</h3>
            </div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${resources.cpu}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-2xl">
              <MemoryStick className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">Memory</p>
              <h3 className="text-2xl font-black">{resources.memory.used}</h3>
            </div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${resources.memory.percent}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl">
              <HardDrive className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">Storage</p>
              <h3 className="text-2xl font-black">{resources.disk.percent}%</h3>
            </div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${resources.disk.percent}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl">
              <Wifi className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">Network</p>
              <h3 className="text-2xl font-black">
                {health?.overallStatus || "Unknown"}
              </h3>
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            ~{health?.latency || "0ms"} avg latency
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-8">
          <h3 className="text-xl font-black mb-6 flex items-center gap-2">
            <Server className="h-5 w-5 text-slate-400" />
            Service Status
          </h3>
          <div className="space-y-4">
            {nodes.map((service, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${service.status === "Operational" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}
                  ></div>
                  <span className="font-bold">{service.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium">
                  <span
                    className={
                      service.status === "Operational"
                        ? "text-emerald-500"
                        : "text-rose-500"
                    }
                  >
                    {service.status}
                  </span>
                  <span className="text-slate-400 w-12 text-right">
                    {service.latency}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-8">
          <h3 className="text-xl font-black mb-6 flex items-center gap-2">
            <Database className="h-5 w-5 text-slate-400" />
            Database Health
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-slate-500">Connection Load</span>
                <span>{resources.database.load}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${resources.database.load}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-slate-500">Status</span>
                <span
                  className={
                    resources.database.status === "Operational"
                      ? "text-emerald-500"
                      : "text-rose-500"
                  }
                >
                  {resources.database.status}
                </span>
              </div>
            </div>
            <div className="pt-4 border-t-2 border-slate-100 dark:border-slate-800">
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                The primary database instance is{" "}
                {resources.database.status.toLowerCase()}. Current connection
                load is at {resources.database.load}% based on recent
                transaction volume.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black flex items-center gap-2">
            <Bug className="h-5 w-5 text-slate-400" />
            Recent Errors (Sentry, last 14 days)
          </h3>
          <a
            href="https://sentry.io/organizations/dumos-technologies/issues/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-indigo-500 hover:underline flex items-center gap-1"
          >
            Open in Sentry
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {errorsLoading && !errorsData ? (
          <p className="text-sm text-slate-500 font-medium">Loading…</p>
        ) : errorsData && !errorsData.configured ? (
          <p className="text-sm text-slate-500 font-medium">
            Sentry API token not configured. Set{" "}
            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              SENTRY_API_TOKEN
            </code>{" "}
            on the server to enable this.
          </p>
        ) : errorsData && errorsData.issues.length === 0 ? (
          <p className="text-sm text-emerald-500 font-bold">
            No unresolved issues. Clean slate.
          </p>
        ) : (
          <div className="space-y-3">
            {errorsData?.issues.map((issue, i) => (
              <a
                key={issue.id || i}
                href={issue.permalink || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-lg shrink-0 ${LEVEL_STYLES[issue.level] || LEVEL_STYLES.error}`}
                  >
                    {issue.level}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold truncate">{issue.title}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {issue.project}
                      {issue.culprit ? ` (${issue.culprit})` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium shrink-0 ml-4">
                  <span className="text-slate-400">
                    {issue.count} event{issue.count === 1 ? "" : "s"}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      <DefaultAccountManagerCard />
    </div>
  );
}
