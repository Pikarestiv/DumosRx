"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, DatabaseBackup, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useAdminBackupStatus,
  useRunBackupMutation,
} from "@/lib/api/admin-hooks-maintenance";
import { formatDateSafe } from "@/lib/utils/date-utils";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ConfigBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Badge
      variant={ok ? "secondary" : "destructive"}
      className="gap-1.5 text-xs font-medium"
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}: {ok ? "Configured" : "Missing"}
    </Badge>
  );
}

export function DatabaseBackupPanel() {
  const [confirming, setConfirming] = useState(false);
  const { data: status, isLoading, isError } = useAdminBackupStatus();
  const runBackup = useRunBackupMutation();

  const handleConfirmRun = () => {
    runBackup.mutate(undefined, {
      onSuccess: (res) => {
        if (res.ok) {
          toast.success("Database backup completed");
        } else {
          toast.error(res.output || "Backup failed");
        }
        setConfirming(false);
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : "Backup failed";
        toast.error(message);
        setConfirming(false);
      },
    });
  };

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseBackup className="h-4 w-4 text-muted-foreground" />
          Database backups
        </CardTitle>
        <CardDescription>
          Encrypted SQL dumps uploaded to the private R2 backup bucket.
          {status?.schedule ? ` Scheduled ${status.schedule.toLowerCase()}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Checking backup configuration…</p>
        )}

        {isError && (
          <p className="text-sm text-destructive">Could not load backup configuration status.</p>
        )}

        {status && (
          <>
            <div className="flex flex-wrap gap-2">
              <ConfigBadge label="R2 bucket" ok={status.bucket_configured} />
              <ConfigBadge label="Encryption key" ok={status.public_key_configured} />
            </div>

            {!status.configured && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Nightly scheduled backups skip silently until{" "}
                  <code>R2_BACKUP_BUCKET</code> and{" "}
                  <code>BACKUP_ENCRYPTION_PUBLIC_KEY</code> are set in the API server environment.
                </span>
              </div>
            )}

            {status.list_error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Could not list bucket contents: {status.list_error}</span>
              </div>
            )}

            {status.configured && !status.list_error && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent daily backups ({status.recent_backups.length})
                </p>
                {status.recent_backups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No backup objects found under <code>daily/</code> yet. Check that system cron invokes{" "}
                    <code>php artisan schedule:run</code>, or run a manual backup below.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {status.recent_backups.map((entry) => (
                      <li
                        key={entry.key}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                      >
                        <span className="font-mono truncate">{entry.key}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatBytes(entry.bytes)} · {formatDateSafe(entry.last_modified, "dd/MM/yyyy HH:mm", "Unknown")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        <Button
          variant="outline"
          className="border-2 font-bold"
          onClick={() => setConfirming(true)}
          disabled={runBackup.isPending || isLoading || !status?.configured}
        >
          {runBackup.isPending ? "Running backup…" : "Run backup now"}
        </Button>

        {runBackup.data?.output && (
          <pre className="text-xs whitespace-pre-wrap break-all text-muted-foreground rounded-md border border-border bg-muted/50 p-3">
            {runBackup.data.output}
          </pre>
        )}
      </CardContent>

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent role="alertdialog" className="bg-background/95 backdrop-blur-sm border shadow-sm">
          <DialogHeader>
            <DialogTitle>Run encrypted database backup now?</DialogTitle>
            <DialogDescription>
              Dumps the live database snapshot, encrypts it with the configured public key, and
              uploads it to the private R2 backup bucket.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={runBackup.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRun} disabled={runBackup.isPending}>
              {runBackup.isPending ? "Backing up…" : "Run backup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
