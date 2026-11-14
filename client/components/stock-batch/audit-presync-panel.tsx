import { useState } from "react";
import { AlertTriangle, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PreAuditSync } from "@/lib/hooks/use-pre-audit-sync";

export function AuditPresyncPanel({ presync }: { presync: PreAuditSync }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (presync.state === "syncing") {
    return (
      <div role="status" className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <div className="text-[13px] font-medium">Syncing the latest stock before you count...</div>
      </div>
    );
  }

  if (presync.state === "stale") {
    return (
      <div role="note" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12.5px] text-amber-800 dark:text-amber-400">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This till couldn&apos;t refresh from the cloud, so counts are measured against stock as of its last sync.
          Sales made on other tills since then are not included.
        </span>
      </div>
    );
  }

  if (presync.state !== "failed") return null;

  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <div className="text-[14px] font-semibold">Couldn&apos;t sync the latest stock</div>
      <div className="max-w-[420px] text-[12.5px] text-muted-foreground">
        {presync.error ?? "Sync failed."} Counting now would measure against this till&apos;s last sync.
      </div>
      <div className="flex gap-2">
        <Button onClick={presync.retry}>Retry</Button>
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>Count anyway</Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Count without the latest stock?"
        description="This till could not get the latest stock from the cloud. Each count is recorded as the difference from what this till believes is on hand, so any sale or delivery made on another till since its last sync will make that difference wrong, and the correction posted to stock will be wrong by the same amount."
        confirmLabel="Count anyway"
        cancelLabel="Go back"
        onConfirm={() => {
          setConfirmOpen(false);
          presync.countAnyway();
        }}
      />
    </div>
  );
}
