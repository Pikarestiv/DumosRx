"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database } from "lucide-react";
import { useAdminMigrationStatus } from "@/lib/api/admin-hooks-maintenance";
import type { AdminMigrationStatus } from "@/lib/types/admin";

const UNAVAILABLE = "Migration status unavailable";

export function MigrationStatusCardView({ data }: { data?: AdminMigrationStatus }) {
  const known = data?.status === "ok" && data.pending_count !== null;
  const pending = known ? (data?.pending_count ?? 0) : null;
  const destructive = (data?.pending ?? []).filter((m) => m.alters_existing_data).length;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-muted-foreground" />
          Database schema
        </CardTitle>
        <CardDescription>
          Whether production has the migrations this release expects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pending === null && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">{UNAVAILABLE}</p>
            {data?.error && (
              <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{data.error}</p>
            )}
          </div>
        )}

        {pending === 0 && (
          <div>
            <p className="text-lg font-black text-foreground">Schema up to date</p>
            {data?.last_batch !== null && data?.last_batch !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">Last applied batch {data.last_batch}</p>
            )}
          </div>
        )}

        {pending !== null && pending > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-black text-amber-500">
                {pending} {pending === 1 ? "migration" : "migrations"} pending
              </p>
              {destructive > 0 && (
                <Badge variant="destructive">
                  {destructive} alter{destructive === 1 ? "s" : ""} existing data
                </Badge>
              )}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/maintenance">Review and run</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MigrationStatusCard() {
  const { data } = useAdminMigrationStatus();

  return <MigrationStatusCardView data={data} />;
}
