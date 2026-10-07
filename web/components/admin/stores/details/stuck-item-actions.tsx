"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIssueSyncCommandMutation, useStoreSyncCommands } from "@/lib/api/admin-hooks-sync";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
import type { DeviceStuckItem } from "@/lib/types/admin-platform";

/**
 * Mirrors the server's allowlist. A business record exists only on the device
 * that made it, so discarding one permanently loses revenue data or falsifies
 * stock — the control is hidden rather than shown-and-refused.
 */
const ABANDONABLE_TABLES = ["feedback", "audit_logs"];

const COMMAND_LABELS = new Map([
  ["retry", "Retry queued"],
  ["send_payload", "Payload request queued"],
  ["abandon", "Abandon queued"],
]);

interface StuckItemActionsProps {
  storeId: string;
  deviceId: string;
  item: DeviceStuckItem;
}

export function StuckItemActions({ storeId, deviceId, item }: StuckItemActionsProps) {
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const issue = useIssueSyncCommandMutation(storeId);
  const { data: commandData } = useStoreSyncCommands(storeId);
  const { user } = useAdminAuthStore();
  const canAbandon = ABANDONABLE_TABLES.includes(item.table_name);

  const queued = (commandData?.commands ?? []).find(
    (command) =>
      command.status === "pending" &&
      command.device_id === deviceId &&
      command.table_name === item.table_name &&
      command.record_id === item.record_id,
  );

  // Both command routes are role:super_admin, while the panel itself is
  // view_platform_health — so a delegated operator could see these controls
  // and get only a refusal. Hidden, not disabled.
  if (!checkIsSuperAdmin(user?.role)) {
    return null;
  }

  if (queued) {
    return (
      <span className="text-xs text-muted-foreground shrink-0">
        {`${COMMAND_LABELS.get(queued.action) ?? "Command queued"} — applies on ${deviceId}'s next sync`}
      </span>
    );
  }

  const send = (action: string, onDone?: () => void) =>
    issue.mutate(
      { device_id: deviceId, action, table_name: item.table_name, record_id: item.record_id },
      {
        onSuccess: () => {
          toast.success(`Queued for ${deviceId} — it applies on that device's next sync.`);
          onDone?.();
        },
        onError: () => {
          toast.error("Could not queue that command");
          onDone?.();
        },
      },
    );

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button size="sm" variant="outline" disabled={issue.isPending} onClick={() => send("retry")}>
        Retry
      </Button>

      {canAbandon && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={issue.isPending}
          onClick={() => setConfirmingAbandon(true)}
        >
          Abandon
        </Button>
      )}

      <Dialog open={confirmingAbandon} onOpenChange={(open) => !open && setConfirmingAbandon(false)}>
        <DialogContent role="alertdialog" className="bg-background/95 backdrop-blur-sm border shadow-sm">
          <DialogHeader>
            <DialogTitle>Discard this queued row?</DialogTitle>
            <DialogDescription>
              {`This tells ${deviceId} to drop ${item.table_name}/${item.record_id} from its sync queue. The device holds the only copy, so it will never reach the cloud. Diagnostic records only — a sale or stock movement cannot be discarded this way.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingAbandon(false)} disabled={issue.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={issue.isPending}
              onClick={() => send("abandon", () => setConfirmingAbandon(false))}
            >
              {issue.isPending ? "Queueing…" : "Discard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
