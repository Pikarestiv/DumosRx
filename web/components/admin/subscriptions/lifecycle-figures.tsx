"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { AdminSubscriptionFigures } from "@/lib/types/admin";

function Figure({
  label,
  value,
  unavailable,
  hint,
}: {
  label: string;
  value?: string | number;
  unavailable?: string;
  hint?: string;
}) {
  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
      <CardContent className="p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        {unavailable ? (
          <p className="text-sm font-medium text-muted-foreground mt-2">{unavailable}</p>
        ) : (
          <p className="text-3xl font-black text-foreground mt-1">{value}</p>
        )}
        {hint && !unavailable && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function LifecycleFiguresView({
  data,
  isError,
}: {
  data?: AdminSubscriptionFigures;
  isError?: boolean;
}) {
  if (isError) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {["Trial conversion", "Lapsed this period", "Recovered this period", "Payments needing attention"].map(
          (label) => (
            <Figure key={label} label={label} unavailable="Unavailable" />
          ),
        )}
      </div>
    );
  }

  const mix = data?.payment_mix;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Figure
        label="Trial conversion"
        value={data?.trial_conversion_rate ?? undefined}
        unavailable={data?.trial_conversion_rate ? undefined : "No trials started"}
        hint={data ? `${data.trials_started} started` : undefined}
      />
      <Figure label="Lapsed this period" value={data?.lapsed_in_period ?? 0} />
      <Figure label="Recovered this period" value={data?.recovered_in_period ?? 0} />
      <Figure
        label="Payments needing attention"
        value={(mix?.failed ?? 0) + (mix?.abandoned ?? 0)}
        hint={mix ? `${mix.success} succeeded · ${mix.pending} pending` : undefined}
      />
    </div>
  );
}
