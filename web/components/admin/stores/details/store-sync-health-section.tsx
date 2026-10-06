import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { formatDateOnlyToDDMMYYYY, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { syncReasonLabel, useAdminStoreSyncHealth } from "@/lib/api/admin-hooks-sync";
import type { AdminStoreSyncHealth } from "@/lib/types/admin";

export function StoreSyncHealthPanel({ storeId }: { storeId: string }) {
  const { data, isLoading } = useAdminStoreSyncHealth(storeId);

  return <StoreSyncHealthSection data={data} isLoading={isLoading} />;
}

interface StoreSyncHealthSectionProps {
  data?: AdminStoreSyncHealth;
  isLoading: boolean;
}

export function StoreSyncHealthSection({ data, isLoading }: StoreSyncHealthSectionProps) {
  const failures = data?.failures?.data ?? [];
  const daily = data?.daily ?? [];

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-black flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-indigo-500" />
          Sync Activity
        </CardTitle>
        <CardDescription>
          What this store has pushed, and what the server refused.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Last sync
          </p>
          <p className="text-lg font-black text-foreground mt-1">
            {data?.last_sync_at ? formatDateToDDMMYYYY(data.last_sync_at) : "Never synced"}
          </p>
        </div>

        {daily.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Recent days
            </p>
            <div className="divide-y divide-border">
              {daily.map((day) => (
                <div key={day.date} className="py-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-muted-foreground">
                    {formatDateOnlyToDDMMYYYY(day.date)}
                  </span>
                  <span className="font-bold">
                    <span className="text-emerald-500">{day.accepted}</span>
                    <span className="text-muted-foreground"> accepted · </span>
                    <span className={day.refused > 0 ? "text-rose-500" : "text-muted-foreground"}>
                      {day.refused}
                    </span>
                    <span className="text-muted-foreground"> refused</span>
                    {day.conflicted > 0 && (
                      <>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-amber-500">{day.conflicted}</span>
                        <span className="text-muted-foreground"> conflicts</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Recent refusals
          </p>
          {isLoading && !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : failures.length === 0 ? (
            <p className="text-sm text-emerald-500 font-bold">No refusals recorded.</p>
          ) : (
            <div className="space-y-2">
              {failures.map((failure) => (
                <div
                  key={failure.id}
                  className="p-3 bg-muted/50 rounded-2xl border border-border space-y-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-foreground">
                      {syncReasonLabel(failure.reason) ?? failure.reason}
                    </p>
                    {failure.operation && (
                      <Badge className="bg-muted text-muted-foreground border-none font-bold text-[10px] shrink-0">
                        {failure.operation}
                      </Badge>
                    )}
                  </div>
                  {syncReasonLabel(failure.reason) && (
                    <code className="text-[10px] text-muted-foreground">{failure.reason}</code>
                  )}
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">{failure.table_name}</span>
                    {failure.record_id && (
                      <>
                        {" · "}
                        <span className="font-mono">{failure.record_id}</span>
                      </>
                    )}
                    {failure.created_at && <> · {formatDateToDDMMYYYY(failure.created_at)}</>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
