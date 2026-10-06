import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthProbe, ProbeStatus } from "@/lib/types/admin";

const STATUS_STYLES: Record<ProbeStatus, string> = {
  Operational: "bg-emerald-500/10 text-emerald-500",
  Degraded: "bg-rose-500/10 text-rose-500",
  Unavailable: "bg-muted text-muted-foreground",
};

const DOT_STYLES: Record<ProbeStatus, string> = {
  Operational: "bg-emerald-500",
  Degraded: "bg-rose-500",
  Unavailable: "bg-muted-foreground",
};

export function HealthProbesCard({ probes }: { probes: HealthProbe[] }) {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-black flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-500" />
          Service Probes
        </CardTitle>
        <CardDescription>
          Each row is a live check run on request, not a static list.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {probes.map((probe) => (
            <div
              key={probe.name}
              className="px-6 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className={cn("h-2 w-2 rounded-full", DOT_STYLES[probe.status])} />
                <span className="text-sm font-bold text-foreground">{probe.name}</span>
              </div>
              <Badge className={cn("border-none font-bold text-[10px]", STATUS_STYLES[probe.status])}>
                {probe.status}
              </Badge>
            </div>
          ))}
          {probes.length === 0 && (
            <p className="px-6 py-4 text-sm text-muted-foreground">No probes reported.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
