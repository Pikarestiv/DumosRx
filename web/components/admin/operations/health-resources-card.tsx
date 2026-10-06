import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Cpu, Database, HardDrive, MemoryStick, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminHealth } from "@/lib/types/admin";

const UNAVAILABLE = "Unavailable on this host";

function Unavailable({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-bold">
          {icon}
          {label}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{UNAVAILABLE}</span>
      </div>
    </div>
  );
}

function Metered({
  label,
  icon,
  value,
  percent,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  percent: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-bold">
          {icon}
          {label}
        </span>
        <span className="font-black text-foreground">{value}</span>
      </div>
      <Progress value={percent} className="h-2" />
    </div>
  );
}

export function HealthResourcesCard({ resources }: { resources: AdminHealth["resources"] }) {
  const { loadAverage, memory, disk, database } = resources;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-black flex items-center gap-2">
          <Server className="h-5 w-5 text-indigo-500" />
          Server Resources
        </CardTitle>
        <CardDescription>
          Readings this host actually exposes. Anything it cannot measure is reported as
          unavailable rather than zero.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadAverage ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-bold">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                Load Average
              </span>
              <span className="font-black text-foreground tabular-nums">
                {loadAverage[1].toFixed(2)} · {loadAverage[5].toFixed(2)} ·{" "}
                {loadAverage[15].toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">1 · 5 · 15 minute averages</p>
          </div>
        ) : (
          <Unavailable label="Load Average" icon={<Cpu className="h-4 w-4 text-muted-foreground" />} />
        )}

        {memory ? (
          <Metered
            label="Memory"
            icon={<MemoryStick className="h-4 w-4 text-muted-foreground" />}
            value={`${memory.used} / ${memory.total}`}
            percent={memory.percent}
          />
        ) : (
          <Unavailable
            label="Memory"
            icon={<MemoryStick className="h-4 w-4 text-muted-foreground" />}
          />
        )}

        {disk ? (
          <Metered
            label="Disk"
            icon={<HardDrive className="h-4 w-4 text-muted-foreground" />}
            value={`${disk.used} / ${disk.total}`}
            percent={disk.percent}
          />
        ) : (
          <Unavailable label="Disk" icon={<HardDrive className="h-4 w-4 text-muted-foreground" />} />
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-bold">
            <Database className="h-4 w-4 text-muted-foreground" />
            Database
          </span>
          <span
            className={cn(
              "font-black",
              database.status === "Operational" ? "text-emerald-500" : "text-rose-500",
            )}
          >
            {database.status}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
