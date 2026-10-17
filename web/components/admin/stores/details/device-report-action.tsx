"use client";

import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIssueSyncCommandMutation, useStoreSyncCommands } from "@/lib/api/admin-hooks-sync";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
import { formatDateSafe } from "@/lib/utils/date-utils";

const ACTION = "send_device_report";

const BADGE = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs";

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

  const latest = (commandData?.commands ?? []).find(
    (command) => command.device_id === deviceId && command.action === ACTION,
  );

  if (latest?.status === "pending" || latest?.status === "sent") {
    const isPending = latest.status === "pending";
    return (
      <span
        className={`${BADGE} border-dashed border-slate-300 text-muted-foreground dark:border-slate-700`}
        title={
          isPending
            ? "Sends on this device's next sync"
            : "The till has picked up the request and is building the report"
        }
      >
        <FileText className="h-3.5 w-3.5" />
        {isPending ? "Report queued" : "Sent to till"}
      </span>
    );
  }

  if (latest?.status === "applied") {
    const at = formatDateSafe(latest.acted_at, "dd/MM/yyyy HH:mm", "");
    return (
      <span
        className={`${BADGE} border-emerald-200 font-medium text-emerald-600 dark:border-emerald-900 dark:text-emerald-400`}
        title={latest.result ?? undefined}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {at ? `Report received ${at}` : "Report received"}
      </span>
    );
  }

  const requestButton = (
    <Button
      size="sm"
      variant="outline"
      className="h-8 shrink-0"
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

  if (latest?.status !== "refused" && latest?.status !== "failed") {
    return requestButton;
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span
        className="inline-flex max-w-[16rem] items-start gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
        title={formatDateSafe(latest.acted_at, "dd/MM/yyyy HH:mm", "")}
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{latest.result ?? "The till could not send that report."}</span>
      </span>
      {requestButton}
    </div>
  );
}
