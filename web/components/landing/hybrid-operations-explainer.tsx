import React from "react";

export function HybridOperationsExplainer() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 bg-muted/30 dark:bg-muted/10 p-8 rounded-3xl border border-muted/50">
      <div className="text-center space-y-2 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold tracking-tight">
          Understanding Hybrid-Offline Operations
        </h3>
        <p className="text-sm text-muted-foreground">
          DumosRx operates as a hybrid app: a secure local engine allows
          full retail and store operations to function 100% without
          internet, while syncing transactions when online.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
        {/* Free */}
        <div className="bg-background rounded-2xl p-5 border border-muted flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Free Standalone
            </span>
            <p className="text-sm font-semibold mt-1">
              Self-Hosted Standalone
            </p>
            <div className="mt-3 space-y-2">
              <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 p-2.5 rounded-lg text-xs">
                <strong>Pros:</strong> No internet needed ever. 100%
                database privacy on your own hardware. Zero subscription
                cost.
              </div>
              <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 p-2.5 rounded-lg text-xs">
                <strong>Cons:</strong> No cloud backups. If your hard drive
                fails, your data is lost. No multi-device sync or remote
                dashboard.
              </div>
            </div>
          </div>
        </div>

        {/* Starter */}
        <div className="bg-background rounded-2xl p-5 border border-muted flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Starter Cloud
            </span>
            <p className="text-sm font-semibold mt-1">
              Independent Devices + Delay Backup
            </p>
            <div className="mt-3 space-y-2">
              <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 p-2.5 rounded-lg text-xs">
                <strong>Pros:</strong> Multi-device store setup (up to 3
                devices) for in-store checkout. Nightly/6-hourly automated
                cloud backup.
              </div>
              <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 p-2.5 rounded-lg text-xs">
                <strong>Cons:</strong> Sync occurs only once every 6 hours.
                Web dashboard stats are delayed by up to 6 hours. No mobile
                app.
              </div>
            </div>
          </div>
        </div>

        {/* Pro */}
        <div className="bg-background rounded-2xl p-5 border border-muted flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-bold text-primary uppercase tracking-wider font-extrabold">
              Pro Connect
            </span>
            <p className="text-sm font-semibold mt-1">
              Near Real-time + Companion App
            </p>
            <div className="mt-3 space-y-2">
              <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 p-2.5 rounded-lg text-xs">
                <strong>Pros:</strong> Fast automatic syncing (30 mins).
                Check your store sales on the go from your phone. Receive
                smart cross-selling suggestions.
              </div>
              <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 p-2.5 rounded-lg text-xs">
                <strong>Cons:</strong> Billed per physical store location.
                Sync relies on periodic local internet connection.
              </div>
            </div>
          </div>
        </div>

        {/* Enterprise */}
        <div className="bg-background rounded-2xl p-5 border border-muted flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Enterprise HQ
            </span>
            <p className="text-sm font-semibold mt-1">
              15-Min Multi-Store Cloud
            </p>
            <div className="mt-3 space-y-2">
              <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 p-2.5 rounded-lg text-xs">
                <strong>Pros:</strong> 15-minute automated cloud replication.
                Monitor multiple branches live from one centralized HQ
                login. Priority SMS notifications.
              </div>
              <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 p-2.5 rounded-lg text-xs">
                <strong>Cons:</strong> Enterprise integration setup
                required. Best suited for stores with multiple physical
                branches.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
