"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Database } from "lucide-react";
import {
  useAdminMigrationStatus,
  useRunMigrationsMutation,
} from "@/lib/api/admin-hooks-maintenance";
import { RunMigrationsDialog } from "./run-migrations-dialog";

export function PendingMigrationsPanel() {
  const [confirming, setConfirming] = useState(false);
  const { data, isLoading } = useAdminMigrationStatus();
  const run = useRunMigrationsMutation();

  const known = data?.status === "ok" && data.pending_count !== null;
  const pending = data?.pending ?? [];

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-muted-foreground" />
          Pending migrations
        </CardTitle>
        <CardDescription>
          A migration that has been written and deployed is not yet a migration that has run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Reading migrator state…</p>}

        {!isLoading && !known && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Migration status unavailable
            </p>
            {data?.error && (
              <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{data.error}</p>
            )}
          </div>
        )}

        {known && pending.length === 0 && (
          <p className="text-sm font-medium text-foreground">
            Nothing pending — the schema matches this release.
          </p>
        )}

        {known && pending.length > 0 && (
          <>
            <ul className="divide-y divide-border rounded-md border border-border">
              {pending.map((migration) => (
                <li
                  key={migration.name}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="font-mono text-xs break-all">{migration.name}</span>
                  {migration.alters_existing_data && (
                    <Badge variant="destructive" className="shrink-0 gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Alters data
                    </Badge>
                  )}
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              className="border-2 font-bold"
              onClick={() => setConfirming(true)}
              disabled={run.isPending}
            >
              Run pending migrations
            </Button>
          </>
        )}

        {run.data && (
          <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Last run
            </p>
            {run.data.applied && run.data.applied.length > 0 ? (
              <ul className="font-mono text-xs space-y-1">
                {run.data.applied.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No migrations were applied.</p>
            )}
            {run.data.output && (
              <pre className="text-xs whitespace-pre-wrap break-all text-muted-foreground">
                {run.data.output}
              </pre>
            )}
          </div>
        )}
      </CardContent>

      <RunMigrationsDialog
        open={confirming}
        pending={pending}
        isPending={run.isPending}
        onOpenChange={(open) => !open && setConfirming(false)}
        onConfirm={() =>
          run.mutate(undefined, {
            onSuccess: () => {
              toast.success("Migrations applied");
              setConfirming(false);
            },
            onError: () => {
              toast.error("Migration run failed — check the output and the pending list");
              setConfirming(false);
            },
          })
        }
      />
    </Card>
  );
}
