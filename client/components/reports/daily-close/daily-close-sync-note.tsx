import { CloudOff, Loader2 } from "lucide-react";
import { useSyncOnOpen } from "@/lib/hooks/use-sync-on-open";

export function DailyCloseSyncNote() {
  const state = useSyncOnOpen();

  if (state === "syncing") {
    return (
      <div role="status" className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing the latest sales from your other tills…
      </div>
    );
  }

  if (state === "not-refreshed") {
    return (
      <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12.5px] text-amber-800 dark:text-amber-400">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>This till couldn&apos;t refresh from the cloud, so the report shows sales as of its last sync. Sales on other tills since then are not included.</span>
      </div>
    );
  }

  return null;
}
