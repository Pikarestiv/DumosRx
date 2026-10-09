"use client";

import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIssueSyncCommandMutation, useStoreSyncCommands } from "@/lib/api/admin-hooks-sync";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";

const ACTION = "send_device_report";

interface DeviceReportActionProps {
  storeId: string;
  deviceId: string;
}

export function DeviceReportAction({ storeId, deviceId }: DeviceReportActionProps) {
  const issue = useIssueSyncCommandMutation(storeId);
  const { data: commandData } = useStoreSyncCommands(storeId);
  const { user } = useAdminAuthStore();

  // The command route is role:super_admin while this panel is
  // view_platform_health, so a delegated operator would see a control that
  // only ever refuses. Hidden, not disabled — same rule as StuckItemActions.
  if (!checkIsSuperAdmin(user?.role)) {
    return null;
  }

  const queued = (commandData?.commands ?? []).find(
    (command) =>
      command.status === "pending" && command.device_id === deviceId && command.action === ACTION,
  );

  if (queued) {
    return (
      <span className="text-xs text-muted-foreground shrink-0">
        Report queued — sends on next sync
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="shrink-0"
      disabled={issue.isPending}
      onClick={() =>
        issue.mutate(
          { device_id: deviceId, action: ACTION, table_name: null, record_id: null },
          {
            onSuccess: () =>
              toast.success(
                `Report requested from ${deviceId} — it sends on that device's next sync.`,
              ),
            onError: () => toast.error("Could not request that report"),
          },
        )
      }
    >
      <FileText className="h-4 w-4 mr-2" />
      {issue.isPending ? "Requesting…" : "Request report"}
    </Button>
  );
}
