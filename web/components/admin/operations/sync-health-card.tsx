import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { syncReasonLabel } from "@/lib/api/admin-hooks-sync";
import type { AdminSyncHealth } from "@/lib/types/admin";

const NO_ACTIVITY = "No sync activity";

function Rate({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      {value ? (
        <p className="text-3xl font-black text-foreground mt-1">{value}</p>
      ) : (
        <p className="text-sm font-medium text-muted-foreground mt-2">{NO_ACTIVITY}</p>
      )}
    </div>
  );
}

interface SyncHealthCardProps {
  data?: AdminSyncHealth;
  isLoading: boolean;
}

export function SyncHealthCard({ data, isLoading }: SyncHealthCardProps) {
  const reasons = Object.entries(data?.failures_by_reason ?? {});
  const worst = data?.worst_stores ?? [];

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-black flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-indigo-500" />
          Sync Health
        </CardTitle>
        <CardDescription>
          Push outcomes recorded by the server. A store whose device never reaches the server at
          all cannot appear here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Rate label="Success rate (24h)" value={data?.success_rate_24h} />
          <Rate label="Success rate (7d)" value={data?.success_rate_7d} />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Refusals by reason
          </p>
          {isLoading && !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : reasons.length === 0 ? (
            <p className="text-sm text-emerald-500 font-bold">No refusals recorded.</p>
          ) : (
            <div className="space-y-2">
              {reasons.map(([reason, count]) => (
                <div
                  key={reason}
                  className="flex items-start justify-between gap-4 p-3 bg-muted/50 rounded-2xl border border-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {syncReasonLabel(reason) ?? reason}
                    </p>
                    {syncReasonLabel(reason) && (
                      <code className="text-[10px] text-muted-foreground">{reason}</code>
                    )}
                  </div>
                  <Badge className="bg-rose-500/10 text-rose-500 border-none font-bold shrink-0">
                    {count}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {worst.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Most affected stores
            </p>
            <div className="divide-y divide-border">
              {worst.map((store) => (
                <div key={store.store_id} className="py-2 flex items-center justify-between gap-4">
                  <span className="text-sm font-bold text-foreground truncate">
                    {store.store_name ?? store.store_id}
                  </span>
                  <span className="text-sm font-black text-rose-500 shrink-0">{store.refused}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
